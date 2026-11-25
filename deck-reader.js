(() => {
  "use strict";

  const MIB = 1024 * 1024;
  const MAX_FILE_SIZE = 24 * MIB;
  const MAX_XML_SIZE = MIB;
  const MAX_PACKAGE_XML_SIZE = 12 * MIB;
  const MAX_SLIDES = 100;
  const MAX_ENTRIES = 4096;
  const MAX_TEXT_PER_SLIDE = 12_000;
  const MAX_TEXT_PER_DECK = 60_000;
  const encryptionFlags = 0x2041;
  const invalidZip = "This .pptx is corrupt or uses an unsupported archive format.";
  const presentationPart = "ppt/presentation.xml";
  const relationshipsPart = "ppt/_rels/presentation.xml.rels";
  const DRAWING = [
    "http://schemas.openxmlformats.org/drawingml/2006/main",
    "http://purl.oclc.org/ooxml/drawingml/main",
  ];
  const PRESENTATION = [
    "http://schemas.openxmlformats.org/presentationml/2006/main",
    "http://purl.oclc.org/ooxml/presentationml/main",
  ];
  const RELATIONSHIP = [
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "http://purl.oclc.org/ooxml/officeDocument/relationships",
  ];
  const MATH = [
    "http://schemas.openxmlformats.org/officeDocument/2006/math",
    "http://purl.oclc.org/ooxml/officeDocument/math",
  ];
  const UTF8 = new TextDecoder("utf-8", { fatal: true });
  const crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    return value;
  });

  function fail(message = invalidZip) {
    throw new Error(message);
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    return (crc ^ 0xffffffff) >>> 0;
  }

  function findDirectory(view) {
    const floor = Math.max(0, view.byteLength - 65_557);
    for (let offset = view.byteLength - 22; offset >= floor; offset--) {
      if (view.getUint32(offset, true) !== 0x06054b50) continue;
      const commentLength = view.getUint16(offset + 20, true);
      if (offset + 22 + commentLength !== view.byteLength) continue;
      const count = view.getUint16(offset + 10, true);
      const size = view.getUint32(offset + 12, true);
      const start = view.getUint32(offset + 16, true);
      if (view.getUint16(offset + 4, true) || view.getUint16(offset + 6, true)
        || view.getUint16(offset + 8, true) !== count || count > MAX_ENTRIES
        || start + size > offset) fail();
      return { count, start, end: start + size };
    }
    fail();
  }

  function openZip(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
      fail("This PowerPoint file may be protected. Export an unlocked .pptx and try again.");
    }
    const { count, start, end } = findDirectory(view);
    const entries = new Map();
    let offset = start;
    for (let index = 0; index < count; index++) {
      if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) fail();
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const next = offset + 46 + nameLength + extraLength + commentLength;
      if (nameLength === 0 || next > end || view.getUint16(offset + 34, true)) fail();
      const name = UTF8.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
      if (entries.has(name)) fail();
      entries.set(name, {
        flags: view.getUint16(offset + 8, true),
        method: view.getUint16(offset + 10, true),
        crc: view.getUint32(offset + 16, true),
        compressed: view.getUint32(offset + 20, true),
        size: view.getUint32(offset + 24, true),
        local: view.getUint32(offset + 42, true),
      });
      offset = next;
    }
    if (offset !== end) fail();
    let totalRead = 0;

    return {
      has: (path) => entries.has(path),
      async xmlText(path) {
        const entry = entries.get(path);
        if (!entry) fail("This .pptx is missing part of its slide data.");
        if (entry.flags & encryptionFlags) fail("Export an unlocked .pptx and try again.");
        if (entry.size > MAX_XML_SIZE || entry.compressed > MAX_XML_SIZE || totalRead + entry.size > MAX_PACKAGE_XML_SIZE) {
          fail("This deck has too much slide data. Try a shorter deck.");
        }
        const local = entry.local;
        if (local + 30 > start || view.getUint32(local, true) !== 0x04034b50
          || (view.getUint16(local + 6, true) & encryptionFlags)
          || view.getUint16(local + 8, true) !== entry.method) fail();
        const nameEnd = local + 30 + view.getUint16(local + 26, true);
        const dataStart = nameEnd + view.getUint16(local + 28, true);
        if (dataStart + entry.compressed > start
          || UTF8.decode(bytes.subarray(local + 30, nameEnd)) !== path) fail();
        const compressed = bytes.subarray(dataStart, dataStart + entry.compressed);
        const data = entry.method === 0 ? compressed
          : entry.method === 8 ? await inflate(compressed, entry.size)
            : fail();
        if (data.length !== entry.size || crc32(data) !== entry.crc) fail();
        totalRead += data.length;
        if ((data[0] === 0xff && data[1] === 0xfe) || (data[0] === 60 && data[1] === 0)) {
          return new TextDecoder("utf-16le", { fatal: true }).decode(data);
        }
        if ((data[0] === 0xfe && data[1] === 0xff) || (data[0] === 0 && data[1] === 60)) {
          return new TextDecoder("utf-16be", { fatal: true }).decode(data);
        }
        return UTF8.decode(data);
      },
    };
  }

  async function inflate(compressed, expectedLength) {
    let stream;
    try {
      stream = new DecompressionStream("deflate-raw");
    } catch {
      fail("This browser cannot unpack this .pptx. Try a newer browser.");
    }
    const reader = new Blob([compressed]).stream().pipeThrough(stream).getReader();
    const output = new Uint8Array(expectedLength);
    let position = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (position + value.length > output.length) {
          await reader.cancel();
          fail();
        }
        output.set(value, position);
        position += value.length;
      }
    } catch {
      fail();
    } finally {
      reader.releaseLock();
    }
    if (position !== output.length) fail();
    return output;
  }

  function isElement(node, namespaces, localName) {
    return namespaces.includes(node.namespaceURI) && node.localName === localName;
  }

  async function parsePart(zip, path, parser) {
    const text = await zip.xmlText(path);
    if (/<!DOCTYPE\b|<!ENTITY\b/i.test(text)) fail("This PowerPoint contains unsupported XML declarations.");
    const document = parser.parseFromString(text, "application/xml");
    if (!document.documentElement || document.getElementsByTagName("parsererror").length) fail();
    return document;
  }

  function slidePath(target) {
    if (!target || target.includes("\\")) return null;
    const base = "https://presentation.invalid";
    try {
      const url = new URL(target, `${base}/ppt/presentation.xml`);
      const path = decodeURIComponent(url.pathname.slice(1));
      if (url.origin === base && !url.search && !url.hash && /^ppt\/slides\/[^/\\]+\.xml$/.test(path)) return path;
    } catch {
      return null;
    }
    return null;
  }

  async function orderedSlides(zip, parser) {
    const presentation = (await parsePart(zip, presentationPart, parser)).documentElement;
    if (!isElement(presentation, PRESENTATION, "presentation")) fail();
    const slideList = Array.from(presentation.children).find((child) => isElement(child, PRESENTATION, "sldIdLst"));
    const refs = Array.from(slideList?.children ?? []).filter((child) => isElement(child, PRESENTATION, "sldId"));
    if (!refs.length) return [];
    if (refs.length > MAX_SLIDES) fail(`Choose a deck with ${MAX_SLIDES} slides or fewer.`);

    const relationships = (await parsePart(zip, relationshipsPart, parser)).documentElement;
    const paths = new Map();
    for (const child of relationships.children) {
      const type = child.getAttribute("Type");
      if (child.localName !== "Relationship" || child.getAttribute("TargetMode") === "External"
        || !RELATIONSHIP.some((namespace) => type === `${namespace}/slide`)) continue;
      const path = slidePath(child.getAttribute("Target"));
      if (path && zip.has(path)) paths.set(child.getAttribute("Id"), path);
    }
    return refs.map((reference) => {
      const id = RELATIONSHIP.map((namespace) => reference.getAttributeNS(namespace, "id")).find(Boolean);
      const path = paths.get(id);
      if (!path) fail("This .pptx is missing part of its slide data.");
      return path;
    });
  }

  function paragraphText(node, depth = 0) {
    if (depth > 40) return "";
    if (isElement(node, DRAWING, "t") || isElement(node, MATH, "t")) return node.textContent;
    if (isElement(node, DRAWING, "br")) return "\n";
    const kids = Array.from(node.children);
    const equationPart = (name) => paragraphText(kids.find((child) => isElement(child, MATH, name)) ?? { children: [] }, depth + 1);
    if (isElement(node, MATH, "f")) {
      const top = equationPart("num");
      const bottom = equationPart("den");
      if (!top || !bottom) return "";
      return /^\d+$/.test(top) && /^\d+$/.test(bottom) ? `${top}/${bottom}` : `(${top})/(${bottom})`;
    }
    if (isElement(node, MATH, "sSup")) return `${equationPart("e")}^${equationPart("sup")}`;
    if (node.localName === "AlternateContent") return kids.length ? paragraphText(kids[0], depth + 1) : "";
    return kids.map((child) => paragraphText(child, depth + 1)).join("");
  }

  function slideText(root) {
    if (!isElement(root, PRESENTATION, "sld")) fail();
    if (["0", "false"].includes(root.getAttribute("show"))) return "";
    const parts = [];
    let length = 0;
    for (const paragraph of root.getElementsByTagNameNS("*", "p")) {
      if (!DRAWING.includes(paragraph.namespaceURI)) continue;
      const value = paragraphText(paragraph).replace(/[^\S\n]+/g, " ").trim();
      if (!value) continue;
      length += value.length + 1;
      if (length > MAX_TEXT_PER_SLIDE) fail("One slide has too much text. Try a shorter deck.");
      parts.push(value);
    }
    return parts.join("\n");
  }

  async function read(file, { Parser = globalThis.DOMParser } = {}) {
    const filename = typeof file?.name === "string" ? file.name : "";
    if (/\.ppt$/i.test(filename)) fail("Save your older .ppt file as .pptx in PowerPoint, then try again.");
    if (!/\.pptx$/i.test(filename)) fail("Choose a PowerPoint .pptx file.");
    if (typeof file.size !== "number" || file.size > MAX_FILE_SIZE) fail("Choose a .pptx file under 24 MB.");
    if (typeof Parser !== "function") fail("This browser cannot read PowerPoint files.");
    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch {
      fail("This PowerPoint file could not be opened. Choose the file again.");
    }
    if (buffer.byteLength > MAX_FILE_SIZE) fail("Choose a .pptx file under 24 MB.");
    try {
      const zip = openZip(buffer);
      if (!zip.has("[Content_Types].xml") || !zip.has(presentationPart)) fail("This file is not a readable PowerPoint .pptx.");
      const parser = new Parser();
      const paths = await orderedSlides(zip, parser);
      const slides = [];
      let total = 0;
      for (const [index, path] of paths.entries()) {
        const text = slideText((await parsePart(zip, path, parser)).documentElement);
        if (!text) continue;
        total += text.length;
        if (total > MAX_TEXT_PER_DECK) fail("This deck has too much slide text. Try a shorter deck.");
        slides.push({ number: index + 1, text });
      }
      if (!slides.length) fail("No visible slide text was found. Choose a .pptx with editable text.");
      const title = filename.slice(0, -5).trim().slice(0, 120) || "PowerPoint lesson";
      return { title, slides };
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) fail();
      throw error;
    }
  }

  globalThis.NumberIslandsDeck = Object.freeze({ read });
})();
