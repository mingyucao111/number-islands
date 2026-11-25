import assert from "node:assert/strict";
import { test } from "node:test";
import { crc32, deflateRawSync } from "node:zlib";
import "../deck-reader.js";

const { read } = globalThis.NumberIslandsDeck;
const namespaces = {
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  m: "http://schemas.openxmlformats.org/officeDocument/2006/math",
};

function element(tag, attributes = {}, children = [], text = "") {
  const [prefix, name] = tag.includes(":") ? tag.split(":") : ["", tag];
  return {
    tag,
    attributes,
    children,
    namespaceURI: namespaces[prefix] ?? "",
    localName: name,
    textContent: text,
    getAttribute: (key) => attributes[key] ?? null,
    getAttributeNS: (ns, key) => {
      const match = Object.keys(namespaces).find((known) => namespaces[known] === ns);
      return attributes[`${match}:${key}`] ?? null;
    },
    getElementsByTagNameNS(ns, key) {
      return children.flatMap((child) => [
        ...(child.localName === key && (ns === "*" || child.namespaceURI === ns) ? [child] : []),
        ...child.getElementsByTagNameNS(ns, key),
      ]);
    },
  };
}

function escapeXml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function printXml(node, root = true) {
  const attrs = [
    ...(root ? Object.entries(namespaces).map(([key, value]) => [`xmlns:${key}`, value]) : []),
    ...Object.entries(node.attributes),
  ].map(([key, value]) => ` ${key}="${escapeXml(value)}"`).join("");
  return `<${node.tag}${attrs}>${escapeXml(node.textContent)}${node.children.map((child) => printXml(child, false)).join("")}</${node.tag}>`;
}

function zip(entries) {
  const prefix = [];
  const directory = [];
  let offset = 0;
  for (const { name, text, method = 0, badCrc = false, flags = 0, claimedSize } of entries) {
    const nameBytes = Buffer.from(name);
    const source = Buffer.from(text);
    const compressed = method === 8 ? deflateRawSync(source) : source;
    const crc = crc32(source) ^ (badCrc ? 1 : 0);
    const size = claimedSize ?? source.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    prefix.push(local, nameBytes, compressed);

    const index = Buffer.alloc(46);
    index.writeUInt32LE(0x02014b50, 0);
    index.writeUInt16LE(20, 4);
    index.writeUInt16LE(20, 6);
    index.writeUInt16LE(flags, 8);
    index.writeUInt16LE(method, 10);
    index.writeUInt32LE(crc >>> 0, 16);
    index.writeUInt32LE(compressed.length, 20);
    index.writeUInt32LE(size, 24);
    index.writeUInt16LE(nameBytes.length, 28);
    index.writeUInt32LE(offset, 42);
    directory.push(index, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.reduce((total, part) => total + part.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...prefix, ...directory, end]);
}

const text = (value) => element("a:r", {}, [element("a:t", {}, [], value)]);
const mathText = (value) => element("m:r", {}, [element("m:t", {}, [], value)]);
const paragraph = (...children) => element("a:p", {}, children);
const slide = (children, props) => element("p:sld", props, [element("p:cSld", {}, children)]);

function sample({ hidden = true, external = false, firstSlideOptions = {}, withEntity = false, noText = false } = {}) {
  const files = [];
  const xml = new Map();
  function add(name, root, options = {}) {
    const printed = printXml(root);
    const content = options.entity ? "<!DOCTYPE r [<!ENTITY fake 'unexpected'>]>" + printed : printed;
    xml.set(content, root);
    files.push({ name, text: content, ...options });
  }
  add("[Content_Types].xml", element("Types"));
  const order = ["basic", "hidden", "advanced"];
  add("ppt/presentation.xml", element("p:presentation", {}, [
    element("p:sldIdLst", {}, order.map((id) => element("p:sldId", { "r:id": id }))),
  ]));
  add("ppt/_rels/presentation.xml.rels", element("Relationships", {}, [
    ...[["advanced", "slides/slide1.xml"], ["basic", "slides/slide9.xml"], ["hidden", "slides/slide2.xml"]].map(([id, target]) => element("Relationship", {
      Id: id, Target: id === "basic" && external ? "https://example.invalid/slide.xml" : target,
      Type: namespaces.r + "/slide",
      ...(id === "basic" && external ? { TargetMode: "External" } : {}),
    })),
  ]), { method: 8 });
  const fraction = element("m:f", {}, [
    element("m:num", {}, [mathText("4")]),
    element("m:den", {}, [mathText("6")]),
  ]);
  add("ppt/slides/slide1.xml", slide(noText ? [] : [paragraph(text("Load "), fraction, text(" & compare"))]), { method: 8 });
  add("ppt/slides/slide2.xml", slide(noText ? [] : [paragraph(text("Hidden notes"))], hidden ? { show: "0" } : {}));
  add("ppt/slides/slide9.xml", slide(noText ? [] : [
    paragraph(text("Equiva"), text("lent fractions"), element("a:br"), text("Move two crates")),
    paragraph(text("The teacher's second line")),
  ]), { ...firstSlideOptions, entity: withEntity });
  add("ppt/slides/slide3.xml", slide([paragraph(text("Do not read: unreferenced"))]));

  class FixtureParser {
    parseFromString(content) {
      const documentElement = xml.get(content);
      assert.ok(documentElement, "Expected a known, correctly decoded fixture");
      return { documentElement, getElementsByTagName: () => [] };
    }
  }

  return { file: new File([zip(files)], "Fraction voyage.PPTX"), Parser: FixtureParser };
}

test("reads stored and deflated parts in manifest order, keeping visible position and math runs", async () => {
  const { file, Parser } = sample();
  assert.deepEqual(await read(file, { Parser }), {
    title: "Fraction voyage",
    slides: [
      { number: 1, text: "Equivalent fractions\nMove two crates\nThe teacher's second line" },
      { number: 3, text: "Load 4/6 & compare" },
    ],
  });
});

test("reads ordinary visible slides and skips unrelated slide parts", async () => {
  const { file, Parser } = sample({ hidden: false });
  const deck = await read(file, { Parser });
  assert.deepEqual(deck.slides.map((slide) => slide.number), [1, 2, 3]);
  assert.equal(deck.slides[1].text, "Hidden notes");
});

test("rejects external slide paths and potentially unsafe XML before parsing", async () => {
  const external = sample({ external: true });
  await assert.rejects(() => read(external.file, { Parser: external.Parser }), /missing part/);
  const entity = sample({ withEntity: true });
  await assert.rejects(() => read(entity.file, { Parser: entity.Parser }), /unsupported XML declarations/);
});

test("reports corrupt, encrypted, and oversized selected ZIP members", async () => {
  for (const [options, message] of [
    [{ badCrc: true }, /corrupt/],
    [{ flags: 1 }, /unlocked/],
    [{ claimedSize: 1_048_577 }, /too much slide data/],
    [{ method: 8, claimedSize: 20 }, /corrupt/],
  ]) {
    const { file, Parser } = sample({ firstSlideOptions: options });
    await assert.rejects(() => read(file, { Parser }), message);
  }
});

test("gives actionable guidance for old PowerPoint, protected files, and image-only decks", async () => {
  const { file, Parser } = sample({ noText: true });
  await assert.rejects(() => read(file, { Parser }), /visible slide text/);
  await assert.rejects(() => read(new File([], "old.ppt"), { Parser }), /Save your older .ppt/);
  await assert.rejects(() => read(new File([new Uint8Array([0xd0, 0xcf])], "locked.pptx"), { Parser }), /protected/);
  await assert.rejects(() => read(new File([], "empty.pptx"), { Parser }), /corrupt/);
  await assert.rejects(() => read({ name: "huge.pptx", size: 30_000_000 }, { Parser }), /under 24 MB/);
});
