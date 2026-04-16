export function getCompressor(ctx) {
  if (ctx._compressor) return ctx._compressor;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value       =   6;
  comp.ratio.value      =   4;
  comp.attack.value     = 0.003;
  comp.release.value    = 0.15;
  comp.connect(ctx.destination);
  ctx._compressor = comp;
  return comp;
}

export function scheduleWoodblock(ctx, time, isDownbeat, vol, sound = 'digital1', isSubdivision = false) {
  // When metronome sound is tick or clave (both noise-based), the count-in uses
  // a digital triangle oscillator instead of the woodblock — the contrast between
  // a pitched digital count-in and a noise click makes the phase transition clearer.
  // Swift port: generate an AVAudioPCMBuffer with the same noise + envelope math,
  // or use an AVAudioPlayerNode scheduled via scheduleBuffer(atTime:).
  if (sound === 'tick') {
    // Digital count-in for tick: triangle oscillator, octave-up on downbeat.
    // Pitched count-in contrasts clearly with the noise-based tick click.
    // Subdivision uses 440 Hz (one octave below normal) at reduced gain.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.connect(gain); gain.connect(getCompressor(ctx));
    if (isSubdivision) {
      osc.frequency.value = 440;
      gain.gain.setValueAtTime(0.3 * vol, time);
    } else {
      osc.frequency.value = isDownbeat ? 1760 : 880;
      gain.gain.setValueAtTime((isDownbeat ? 0.9 : 0.55) * vol, time);
    }
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
    osc.start(time); osc.stop(time + 0.08);
    return;
  }
  // Default woodblock: pre-rendered via OfflineAudioContext with seeded PRNG,
  // same approach as the tick click — eliminates per-hit volume variance from
  // fresh random noise synthesis. Two variants: downbeat (2000 Hz) and normal (1400 Hz).
  // Gain envelope baked in; playback applies only the master vol scalar.
  const wbKey = '_woodblockBufs';
  if (!ctx[wbKey]) {
    function seededRand(seed) {
      return function() {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    function renderWoodblock(freq, gainVal, seed) {
      const rand    = seededRand(seed);
      const decay   = 0.05;
      const sr      = ctx.sampleRate;
      const bufSize = Math.floor(sr * decay);
      const offline = new OfflineAudioContext(1, bufSize, sr);
      const noiseBuf = offline.createBuffer(1, bufSize, sr);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++)
        data[i] = (rand() * 2 - 1) * Math.pow(1 - i / bufSize, 10);
      const src = offline.createBufferSource();
      src.buffer = noiseBuf;
      const filter = offline.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = 4;
      const gain = offline.createGain();
      gain.gain.setValueAtTime(gainVal, 0);
      gain.gain.exponentialRampToValueAtTime(0.001, decay);
      src.connect(filter); filter.connect(gain); gain.connect(offline.destination);
      src.start(0);
      return offline.startRendering();
    }
    ctx[wbKey] = Promise.all([
      renderWoodblock(2000, 2.8, 0xdeadbeef),  // downbeat
      renderWoodblock(1400, 2.0, 0xcafebabe),  // normal beat
      renderWoodblock(900,  1.4, 0xf0e1d2c3),  // subdivision
    ]);
  }
  ctx[wbKey].then(([downbeatBuf, normalBuf, subdivBuf]) => {
    const renderedBuf = isSubdivision ? subdivBuf : isDownbeat ? downbeatBuf : normalBuf;
    const src = ctx.createBufferSource();
    src.buffer = renderedBuf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    src.connect(gain); gain.connect(getCompressor(ctx));
    src.start(time);
  });
}

export function scheduleEndBell(ctx, time, vol) {
  const bufSize = Math.floor(ctx.sampleRate * 0.06);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++)
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 8);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2800;
  filter.Q.value = 5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol * 1.4, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
  src.connect(filter); filter.connect(gain); gain.connect(getCompressor(ctx));
  src.start(time); src.stop(time + 0.09);
}

export function scheduleMetronomeClick(ctx, time, beatStateOrDownbeat, vol, isSubdivision, sound = 'digital1') {
  // beatStateOrDownbeat: "accent" | "normal" | "silent" | true (downbeat) | false (non-downbeat)
  // Legacy boolean usage (non-metronome-view paths): true = downbeat, false = normal
  // sound: 'digital1' | 'digital2' | 'tick'
  const beatState = typeof beatStateOrDownbeat === 'string'
    ? beatStateOrDownbeat
    : beatStateOrDownbeat ? 'accent' : 'normal';
  if (beatState === 'silent') return;

  if (sound === 'tick') {
    // Tick: pre-rendered noise buffers, generated once per AudioContext and cached.
    // Pre-rendering eliminates run-to-run volume variance — short filtered noise is
    // inherently random, so synthesising it fresh each click causes wild loudness
    // swings (±10 dB). Baking the filter into the buffer via OfflineAudioContext
    // makes every click identical. Gains are tuned to match Blip/Ping RMS.
    // Three variants: accent (2000 Hz bandpass), normal (1200 Hz), subdiv (900 Hz).
    const tickKey = '_tickBufs';
    if (!ctx[tickKey]) {
      // Render all three variants. OfflineAudioContext renders synchronously into
      // a buffer — the result is deterministic regardless of when it's called.
      const decay = 0.05;
      // Seeded PRNG (mulberry32) — same seed every run so the rendered buffer is
      // identical across page loads and devices, eliminating between-session variance.
      function seededRand(seed) {
        return function() {
          seed |= 0; seed = seed + 0x6D2B79F5 | 0;
          let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
          t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
          return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
      }
      function renderTick(freq, q, gainVal, seed) {
        const rand    = seededRand(seed);
        const sr      = ctx.sampleRate;
        const bufSize = Math.floor(sr * decay);
        const offline = new OfflineAudioContext(1, bufSize, sr);
        const noiseBuf = offline.createBuffer(1, bufSize, sr);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < bufSize; i++)
          data[i] = (rand() * 2 - 1) * Math.pow(1 - i / bufSize, 14);
        const src = offline.createBufferSource();
        src.buffer = noiseBuf;
        const filter = offline.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = freq;
        filter.Q.value = q;
        const gain = offline.createGain();
        gain.gain.setValueAtTime(gainVal, 0);
        gain.gain.exponentialRampToValueAtTime(0.001, decay);
        src.connect(filter); filter.connect(gain); gain.connect(offline.destination);
        src.start(0);
        // startRendering() returns a Promise, but we resolve it lazily on first use
        return offline.startRendering();
      }
      ctx[tickKey] = Promise.all([
        renderTick(2000, 5, 14.0, 0x1a2b3c4d),  // accent
        renderTick(1200, 5, 10.0, 0x5e6f7a8b),  // normal
        renderTick(900,  4,  6.0, 0x9cad0ebe),  // subdiv
      ]);
    }
    ctx[tickKey].then(([accentBuf, normalBuf, subdivBuf]) => {
      const renderedBuf = isSubdivision ? subdivBuf
                        : beatState === 'accent' ? accentBuf : normalBuf;
      const src = ctx.createBufferSource();
      src.buffer = renderedBuf;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, time);
      src.connect(gain); gain.connect(getCompressor(ctx));
      src.start(time);
    });
    return;
  }

  if (sound === 'digital2') {
    // Digital 2: triangle wave click at the same pitches as the count-in triangle
    // oscillator (880 Hz normal, 1760 Hz accent). This is the same sound the user
    // hears during the count-in when using digital1/digital2 — familiar, warm,
    // pitched. Subdivision uses 440 Hz (one octave below normal) for distinction.
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(getCompressor(ctx));
    if (isSubdivision) {
      osc.frequency.value = 440;
      gain.gain.setValueAtTime(0.35 * vol, time);
    } else {
      osc.frequency.value = beatState === 'accent' ? 1760 : 880;
      gain.gain.setValueAtTime((beatState === 'accent' ? 0.9 : 0.55) * vol, time);
    }
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
    osc.start(time); osc.stop(time + 0.08);
    return;
  }

  // digital1: original sine click (unchanged)
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(getCompressor(ctx));
  if (isSubdivision) {
    osc.frequency.value = 500;
    gain.gain.setValueAtTime(0.22 * vol, time);
  } else {
    osc.frequency.value = beatState === 'accent' ? 1000 : 700;
    gain.gain.setValueAtTime((beatState === 'accent' ? 0.9 : 0.5) * vol, time);
  }
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
  osc.start(time); osc.stop(time + 0.09);
}

// Keeps the AudioContext alive and currentTime advancing continuously.
// Browsers suspend an idle AudioContext after ~30s of silence, which resets or
// pauses currentTime — causing timing jumps when the scheduler resumes.
// A near-silent (0.001 gain) looping buffer prevents suspension without being
// audible. Must be started once on fresh start and stopped on full stop.
// Swift port: AVAudioEngine doesn't auto-suspend; this trick is not needed,
// but the audio session category must be set to .playback for background audio.
export function startSilentLoop(ctx) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const gain = ctx.createGain();
  gain.gain.value = 0.001;
  src.connect(gain); gain.connect(getCompressor(ctx));
  src.start();
  return src;
}
