export function createSoundscape() {
  let context;
  let master;
  let muted = false;

  function start() {
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Context) return Promise.resolve(false);
    if (!context) {
      context = new Context();
      master = context.createGain();
      master.gain.value = muted ? 0 : .32;
      master.connect(context.destination);
      const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
      const noise = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < noise.length; i++) {
        last = .968 * last + .13 * (2 * Math.random() - 1);
        noise[i] = last;
      }
      const surf = context.createBufferSource();
      surf.buffer = buffer;
      surf.loop = true;
      const lowPass = context.createBiquadFilter();
      lowPass.frequency.value = 430;
      const swell = context.createGain();
      swell.gain.value = .11;
      const cycle = context.createOscillator();
      const depth = context.createGain();
      cycle.frequency.value = .17;
      depth.gain.value = .07;
      cycle.connect(depth);
      depth.connect(swell.gain);
      surf.connect(lowPass).connect(swell).connect(master);
      surf.start();
      cycle.start();
    }
    return context.resume().then(() => true).catch(() => false);
  }

  function play(cue = "use") {
    if (!context || context.state !== "running" || muted) return;
    const pitches = cue === "complete" ? [261.63, 329.63, 392, 523.25]
      : cue === "advance" ? [329.63, 392, 523.25] : [293.66, 392];
    const now = context.currentTime;
    pitches.forEach((pitch, index) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const at = now + .068 * index;
      oscillator.type = "sine";
      oscillator.frequency.value = pitch;
      envelope.gain.setValueAtTime(.001, at);
      envelope.gain.exponentialRampToValueAtTime(.13, at + .06);
      envelope.gain.exponentialRampToValueAtTime(.001, at + .65);
      oscillator.connect(envelope).connect(master);
      oscillator.start(at);
      oscillator.stop(at + .68);
    });
  }

  function toggle() {
    muted = !muted;
    if (master && context) master.gain.setTargetAtTime(muted ? 0 : .32, context.currentTime, .07);
    return muted;
  }

  return { start, play, toggle };
}
