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

export function scheduleWoodblock(ctx, time, isDownbeat, vol) {
  const bufSize = Math.floor(ctx.sampleRate * 0.05);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++)
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 10);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = isDownbeat ? 2000 : 1400;
  filter.Q.value = 4;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime((isDownbeat ? 2.8 : 2.0) * vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  src.connect(filter); filter.connect(gain); gain.connect(getCompressor(ctx));
  src.start(time); src.stop(time + 0.06);
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

export function scheduleMetronomeClick(ctx, time, beatStateOrDownbeat, vol, isSubdivision) {
  // beatStateOrDownbeat: "accent" | "normal" | "silent" | true (downbeat) | false (non-downbeat)
  // Legacy boolean usage (non-metronome-view paths): true = downbeat, false = normal
  const beatState = typeof beatStateOrDownbeat === 'string'
    ? beatStateOrDownbeat
    : beatStateOrDownbeat ? 'accent' : 'normal';
  if (beatState === 'silent') return;
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
