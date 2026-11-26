import assert from "node:assert/strict";
import { test } from "node:test";
import { joinDuelHost, startDuelHost } from "../voyage/duel-link.mjs";

const SDP = [
  "v=0",
  "o=- 1 1 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
  "a=candidate:1 1 UDP 2122260223 random.local 54400 typ host",
  "a=ice-ufrag:fake",
  "",
].join("\r\n");

function emit(target, name, props = {}) {
  const event = new Event(name);
  for (const [key, value] of Object.entries(props)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event);
}

class Channel extends EventTarget {
  readyState = "connecting";
  bufferedAmount = 0;
  sent = [];
  constructor(label, protocol) {
    super();
    this.label = label;
    this.protocol = protocol;
  }
  open() {
    this.readyState = "open";
    emit(this, "open");
  }
  close() {
    this.readyState = "closed";
    emit(this, "close");
  }
  send(data) {
    this.sent.push(data);
  }
}

function fakePeer(t) {
  const oldClass = globalThis.RTCPeerConnection;
  const peers = [];
  globalThis.RTCPeerConnection = class extends EventTarget {
    iceGatheringState = "new";
    connectionState = "new";
    constructor(configuration) {
      super();
      this.configuration = configuration;
      peers.push(this);
    }
    createDataChannel(label, options) {
      this.channel = new Channel(label, options.protocol);
      return this.channel;
    }
    async createOffer() { return { type: "offer", sdp: SDP }; }
    async createAnswer() { return { type: "answer", sdp: SDP }; }
    async setLocalDescription(description) {
      this.localDescription = description;
      this.iceGatheringState = this.hang ? "gathering" : "complete";
      emit(this, "icegatheringstatechange");
    }
    async setRemoteDescription(description) { this.remoteDescription = description; }
    close() { this.closed = true; }
  };
  t.after(() => {
    if (oldClass) globalThis.RTCPeerConnection = oldClass;
    else delete globalThis.RTCPeerConnection;
  });
  return peers;
}

const options = { iceServers: [] };

test("the offer and matching answer create a single data-only match", async (t) => {
  const peers = fakePeer(t);
  const host = await startDuelHost({}, options);
  t.after(() => host.close());
  const guest = await joinDuelHost(host.code, {}, options);
  t.after(() => guest.close());
  assert.match(host.code, /^[A-Za-z0-9_-]+$/);
  assert.match(guest.code, /^[A-Za-z0-9_-]+$/);
  await host.accept(guest.code);
  assert.deepEqual(peers.map(({ configuration }) => configuration.iceServers), [[], []]);
  assert.equal(peers[0].remoteDescription.type, "answer");
  assert.equal(peers[1].remoteDescription.type, "offer");
  await assert.rejects(host.accept(guest.code), { code: "reply-already-used" });
});

test("bad tokens, the opposite code, and another invitation cannot mutate a signaling session", async (t) => {
  const peers = fakePeer(t);
  await assert.rejects(joinDuelHost("A".repeat(40_000), {}, options), { code: "invalid-code" });
  await assert.rejects(joinDuelHost("not-an-invitation", {}, options), { code: "invalid-code" });
  assert.equal(peers.length, 0);
  const host = await startDuelHost({}, options);
  t.after(() => host.close());
  await assert.rejects(host.accept(host.code), { code: "wrong-code-type" });
  const other = await startDuelHost({}, options);
  t.after(() => other.close());
  const wrong = await joinDuelHost(other.code, {}, options);
  t.after(() => wrong.close());
  await assert.rejects(host.accept(wrong.code), { code: "different-match" });
  assert.equal(peers[0].remoteDescription, undefined);
  const right = await joinDuelHost(host.code, {}, options);
  t.after(() => right.close());
  await host.accept(right.code);
  assert.equal(peers[0].remoteDescription.type, "answer");
});

test("data-only signaling rejects an incoming SDP with an audio m-line", async (t) => {
  const peers = fakePeer(t);
  const host = await startDuelHost({}, options);
  t.after(() => host.close());
  const payload = JSON.parse(Buffer.from(host.code, "base64url").toString());
  payload.sdp += "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
  const crafted = Buffer.from(JSON.stringify(payload)).toString("base64url");
  await assert.rejects(joinDuelHost(crafted, {}, options), { code: "invalid-code" });
  assert.equal(peers.length, 1);
});

test("only bounded JSON records are forwarded, with backpressure and one close notification", async (t) => {
  const peers = fakePeer(t);
  const messages = [];
  const closed = [];
  let opens = 0;
  const host = await startDuelHost({
    onOpen() { opens++; },
    onMessage(data) { messages.push(data); },
    onClose(reason) { closed.push(reason); },
  }, options);
  const channel = peers[0].channel;
  assert.equal(host.send({ action: "ready" }), false);
  channel.open();
  assert.equal(opens, 1);
  assert.equal(host.send({ action: "ready", positions: [[2, 3], [4, 5]] }), true);
  assert.deepEqual(JSON.parse(channel.sent[0]), { action: "ready", positions: [[2, 3], [4, 5]] });
  assert.equal(host.send({ text: "🦔".repeat(4000) }), false);
  const excessive = Array.from({ length: 64 }, () => Array(64).fill(0));
  assert.equal(host.send({ excessive }), false);
  channel.bufferedAmount = 500_000;
  assert.equal(host.send({ action: "state" }), false);
  channel.bufferedAmount = 0;
  emit(channel, "message", { data: "not JSON" });
  emit(channel, "message", { data: JSON.stringify({ text: "🦔".repeat(4000) }) });
  emit(channel, "message", { data: '{"__proto__":{"winner":true}}' });
  emit(channel, "message", { data: '{"action":"crown","payload":{"index":2}}' });
  assert.deepEqual(messages, [{ action: "crown", payload: { index: 2 } }]);
  host.close();
  host.close();
  assert.deepEqual(closed, ["closed"]);
  assert.equal(host.send({ action: "bye" }), false);
});

test("abort leaves no open underlying connection", async (t) => {
  const peers = fakePeer(t);
  const signal = new AbortController();
  signal.abort();
  await assert.rejects(startDuelHost({}, { ...options, signal: signal.signal }), { code: "aborted" });
  assert.equal(peers.length, 0);
  const active = new AbortController();
  const reasons = [];
  const link = await startDuelHost({ onClose: (reason) => reasons.push(reason) }, { ...options, signal: active.signal });
  t.after(() => link.close());
  active.abort();
  assert.equal(peers[0].closed, true);
  assert.deepEqual(reasons, ["aborted"]);
});

test("a guest waiting for an unapplied reply times out once", async (t) => {
  fakePeer(t);
  const host = await startDuelHost({}, options);
  t.after(() => host.close());
  const errors = [];
  let finish;
  const result = new Promise((resolve) => { finish = resolve; });
  const guest = await joinDuelHost(host.code, {
    onError(error) { errors.push(error.code); },
    onClose(reason) { finish(reason); },
  }, { ...options, connectTimeoutMs: 8 });
  assert.equal(await result, "failed");
  assert.deepEqual(errors, ["connect-timeout"]);
  assert.equal(guest.send({ action: "ready" }), false);
});
