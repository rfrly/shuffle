import { STORAGE_KEY, TIME_SIGS, EX_MIN, EX_MAX } from './constants.js';

export function loadSettings() {
  try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : null; }
  catch { return null; }
}
export function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}
export function loadUrlParams() {
  try {
    const p = new URLSearchParams(window.location.search);
    if (!p.toString()) return null;
    const r = {};
    if (p.has("bpm"))    { const v = parseInt(p.get("bpm"));    if (v >= 30 && v <= 300) r.bpm = v; }
    if (p.has("sig"))    { const v = p.get("sig");               if (TIME_SIGS.some(t => t.label === v)) r.timeSig = v; }
    if (p.has("exlen"))  { const v = parseInt(p.get("exlen"));   if ([1,2,4].includes(v)) r.exerciseLength = v; }
    if (p.has("min"))    { const v = parseInt(p.get("min"));     if (v >= 1 && v <= 200) r.minEx = v; }
    if (p.has("max"))    { const v = parseInt(p.get("max"));     if (v >= 1 && v <= 200) r.maxEx = v; }
    if (p.has("cib"))    { const v = parseInt(p.get("cib"));     if ([0,1,2,4].includes(v)) r.countInBars = v; }
    if (p.has("cie"))    r.countInEvery = p.get("cie") === "1";
    if (p.has("sdci"))   r.subdivCountIn = p.get("sdci") === "1";
    if (p.has("mode"))   { const v = p.get("mode"); if (["fullset","sequential","clickonly"].includes(v)) r.mode = v; }
    if (p.has("sets"))   { const v = p.get("sets"); r.sets = v === "inf" ? '∞' : (parseInt(v) >= 1 ? parseInt(v) : 1); }
    if (p.has("dm"))     { const v = p.get("dm"); if (["bars","timer"].includes(v)) r.displayMode = v; }
    if (p.has("rounds")) { const v = parseInt(p.get("rounds"));  if (v >= 1 && v <= 32) r.barsPerExercise = v; }
    if (p.has("exmode")) { const v = p.get("exmode"); if (["range","pick"].includes(v)) r.exMode = v; }
    if (p.has("picks"))  { const nums = p.get("picks").split(",").map(Number).filter(n => n >= 1 && n <= 200); if (nums.length > 0) { r.pickedNums = nums; r.exMode = "pick"; } }
    if (p.has("lm"))     r.letterMode = p.get("lm") === "1";
    return Object.keys(r).length > 0 ? r : null;
  } catch { return null; }
}
