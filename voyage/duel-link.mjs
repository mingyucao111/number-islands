const STUN = Object.freeze([{ urls: "stun:stun.l.google.com:19302" }]);
const CHANNEL = "number-islands-duel";
const PROTOCOL = "ni-duel-v1";
const BYE = "@ni-duel/close/1";
const MAX_CODE = 17_000;
const MAX_SDP = 12_000;
export const MAX_DUEL_PACKET_BYTES = 12 * 1024;
const MAX_PENDING = 48_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export class DuelLinkError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DuelLinkError";
    this.code = code;
  }
}

function badCode() {
  return new DuelLinkError("invalid-code", "Paste the full friend-match code.");
}

function cancelled() {
  return new DuelLinkError("aborted", "Friend match cancelled.");
}

function closed() {
  return new DuelLinkError("closed", "This friend match is closed.");
}

function encodeBytes(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function safeDescription(sdp) {
  if (typeof sdp !== "string" || sdp.length > MAX_SDP || !/^v=0(?:\r?\n)/.test(sdp)
    || /\r(?!\n)|[^\r\n\t\x20-\x7e]/.test(sdp)) return false;
  const lines = sdp.split(/\r?\n/).map((line) => line.trim());
  const media = lines.filter((line) => /^m=/i.test(line));
  const data = /^m=application \d{1,5} (?:UDP\/DTLS\/SCTP|TCP\/DTLS\/SCTP|DTLS\/SCTP) (?:webrtc-datachannel|\d+)$/;
  return media.length === 1 && data.test(media[0]) && !lines.some((line) => /^a=identity:/i.test(line))
    && lines.some((line) => line.startsWith("a=candidate:"));
}

function readCode(code, expected) {
  if (typeof code !== "string" || code.length > MAX_CODE + 64) throw badCode();
  const token = code.trim();
  if (!token || token.length > MAX_CODE || !/^[\w-]+$/.test(token)) throw badCode();
  let value;
  try {
    const bytes = Uint8Array.from(atob(token.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));
    value = JSON.parse(decoder.decode(bytes));
  } catch {
    throw badCode();
  }
  if (!value || Array.isArray(value) || typeof value !== "object" || Object.keys(value).length !== 4
    || value.v !== 1 || typeof value.id !== "string" || !/^[\w-]{22}$/.test(value.id)
    || !["offer", "answer"].includes(value.type) || !safeDescription(value.sdp)) throw badCode();
  if (value.type !== expected) {
    throw new DuelLinkError("wrong-code-type", expected === "answer"
      ? "Paste your friend’s reply code." : "Paste your friend’s invitation code.");
  }
  return value;
}

function objectRecord(value) {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeJson(value, depth = 0, budget = { left: 2048 }) {
  if (--budget.left < 0) return false;
  if (typeof value === "string") return value.length <= MAX_DUEL_PACKET_BYTES;
  if (value === null || typeof value === "boolean" || Number.isFinite(value)) return true;
  if (depth >= 9) return false;
  if (Array.isArray(value)) return value.length <= 128 && value.every((part) => safeJson(part, depth + 1, budget));
  return objectRecord(value) && Object.keys(value).length <= 64
    && Object.entries(value).every(([key, part]) =>
      !["__proto__", "constructor", "prototype"].includes(key) && safeJson(part, depth + 1, budget));
}

function formatPacket(value) {
  try {
    if (!objectRecord(value) || !safeJson(value)) return null;
    const json = JSON.stringify(value);
    return encoder.encode(json).length <= MAX_DUEL_PACKET_BYTES ? json : null;
  } catch {
    return null;
  }
}

function readPacket(value) {
  if (typeof value !== "string" || value.length > MAX_DUEL_PACKET_BYTES || encoder.encode(value).length > MAX_DUEL_PACKET_BYTES) return null;
  try {
    const parsed = JSON.parse(value);
    return objectRecord(parsed) && safeJson(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function waitForCandidates(peer, timeout, signal) {
  if (signal.aborted || peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, timeout);
    function finish() {
      clearTimeout(timer);
      peer.removeEventListener("icegatheringstatechange", progress);
      signal.removeEventListener("abort", finish);
      resolve();
    }
    function progress() {
      if (peer.iceGatheringState === "complete") finish();
    }
    peer.addEventListener("icegatheringstatechange", progress);
    signal.addEventListener("abort", finish, { once: true });
  });
}

function duration(value, fallback, maximum) {
  return Number.isFinite(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

function createConnection(callbacks, options) {
  const external = options.signal;
  if (external?.aborted) throw cancelled();
  if (typeof RTCPeerConnection !== "function") {
    throw new DuelLinkError("unsupported", "This browser cannot start a direct friend match.");
  }
  let peer;
  try {
    peer = new RTCPeerConnection({ iceServers: options.iceServers ?? STUN });
  } catch {
    throw new DuelLinkError("unavailable", "This browser could not start a direct connection.");
  }
  const events = new AbortController();
  let channel;
  let stopped = false;
  let opened = false;
  let connectionTimer;
  let disconnectedTimer;
  const on = (target, name, listener) => target.addEventListener(name, listener, { signal: events.signal });
  const tell = (name, ...args) => { if (typeof callbacks[name] === "function") callbacks[name](...args); };

  function stop(reason, error, tellPeer = false, notify = true) {
    if (stopped) return;
    stopped = true;
    clearTimeout(connectionTimer);
    clearTimeout(disconnectedTimer);
    events.abort();
    let sent = false;
    if (tellPeer && channel?.readyState === "open" && channel.bufferedAmount < MAX_PENDING) {
      try { channel.send(BYE); sent = true; } catch { /* close even if the transport is already gone */ }
    }
    channel?.close();
    if (sent) setTimeout(() => peer.close(), 150);
    else peer.close();
    if (error) tell("onError", error);
    if (notify) tell("onClose", reason);
  }

  function checkAlive() {
    if (external?.aborted) throw cancelled();
    if (stopped) throw closed();
  }

  function monitorConnection() {
    if (stopped || opened) return;
    clearTimeout(connectionTimer);
    const timeout = duration(options.connectTimeoutMs, 75_000, 180_000);
    connectionTimer = setTimeout(() => {
      stop("failed", new DuelLinkError("connect-timeout", "Couldn’t connect directly. Check the two codes, or try again on another network."));
    }, timeout);
  }

  function bindChannel(candidate) {
    if (channel || candidate.label !== CHANNEL || candidate.protocol !== PROTOCOL) {
      candidate.close();
      return;
    }
    channel = candidate;
    function ready() {
      if (stopped || opened) return;
      opened = true;
      clearTimeout(connectionTimer);
      tell("onOpen");
    }
    on(channel, "open", ready);
    on(channel, "message", ({ data }) => {
      if (data === BYE) { stop("peer"); return; }
      const packet = readPacket(data);
      if (packet) tell("onMessage", packet);
    });
    on(channel, "close", () => stop("peer"));
    on(channel, "error", () => stop("failed", new DuelLinkError("connection-failed", "The direct game connection was lost.")));
    if (channel.readyState === "open") ready();
  }

  function send(message) {
    if (stopped || channel?.readyState !== "open" || channel.bufferedAmount >= MAX_PENDING) return false;
    const packet = formatPacket(message);
    if (!packet) return false;
    try {
      channel.send(packet);
      return true;
    } catch {
      return false;
    }
  }

  async function describe(type, id) {
    const description = type === "offer" ? await peer.createOffer() : await peer.createAnswer();
    checkAlive();
    await peer.setLocalDescription(description);
    await waitForCandidates(peer, duration(options.gatherTimeoutMs, 6500, 30_000), events.signal);
    checkAlive();
    const sdp = peer.localDescription?.sdp;
    if (!safeDescription(sdp)) {
      throw new DuelLinkError("no-candidates", "No direct network path was collected. Try another connection.");
    }
    const token = encodeBytes(encoder.encode(JSON.stringify({ v: 1, id, type, sdp })));
    if (token.length > MAX_CODE) throw new DuelLinkError("code-too-large", "Could not fit this network’s connection details into a friend code.");
    return token;
  }

  on(peer, "connectionstatechange", () => {
    if (peer.connectionState === "failed") {
      stop("failed", new DuelLinkError("connection-failed", "The direct connection failed. A firewall or network can block friend matches."));
    } else if (peer.connectionState === "disconnected" && !disconnectedTimer) {
      disconnectedTimer = setTimeout(() => {
        stop("failed", new DuelLinkError("connection-failed", "The direct game connection was lost."));
      }, 4500);
    } else if (peer.connectionState === "connected") {
      clearTimeout(disconnectedTimer);
      disconnectedTimer = undefined;
    }
  });
  if (external) on(external, "abort", () => stop("aborted"), { once: true });

  return {
    peer, on, checkAlive, bindChannel, describe, monitorConnection, send,
    close() { stop("closed", undefined, true); },
    dispose() { stop("closed", undefined, false, false); },
  };
}

function signalingError(error) {
  return error instanceof DuelLinkError ? error : new DuelLinkError("signaling-failed", "Could not exchange direct connection details. Try making a new invitation.");
}

export async function startDuelHost(callbacks = {}, options = {}) {
  const connection = createConnection(callbacks, options);
  try {
    const id = encodeBytes(crypto.getRandomValues(new Uint8Array(16)));
    connection.bindChannel(connection.peer.createDataChannel(CHANNEL, { ordered: true, protocol: PROTOCOL }));
    const code = await connection.describe("offer", id);
    let used = false;
    let accepting = false;
    return {
      code,
      send: connection.send,
      close: connection.close,
      async accept(replyCode) {
        connection.checkAlive();
        if (used || accepting) throw new DuelLinkError("reply-already-used", "This invitation already has a reply.");
        const reply = readCode(replyCode, "answer");
        if (reply.id !== id) throw new DuelLinkError("different-match", "That reply is for a different friend match.");
        accepting = true;
        try {
          await connection.peer.setRemoteDescription({ type: reply.type, sdp: reply.sdp });
          connection.checkAlive();
          used = true;
          connection.monitorConnection();
        } catch (error) {
          throw signalingError(error);
        } finally {
          accepting = false;
        }
      },
    };
  } catch (error) {
    connection.dispose();
    throw signalingError(error);
  }
}

export async function joinDuelHost(offerCode, callbacks = {}, options = {}) {
  const offer = readCode(offerCode, "offer");
  const connection = createConnection(callbacks, options);
  try {
    connection.on(connection.peer, "datachannel", ({ channel }) => connection.bindChannel(channel));
    await connection.peer.setRemoteDescription({ type: offer.type, sdp: offer.sdp });
    connection.checkAlive();
    const code = await connection.describe("answer", offer.id);
    connection.monitorConnection();
    return { code, send: connection.send, close: connection.close };
  } catch (error) {
    connection.dispose();
    throw signalingError(error);
  }
}
