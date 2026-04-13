import { useState, useEffect, useRef, useCallback } from 'react';
import * as ReactDOM from 'react-dom';
import {
  TIME_SIGS, MODE_FULLSET, MODE_SEQUENTIAL, MODE_CLICKONLY,
  SET_COMPLETE_DISPLAY_MS, BPM_MIN, BPM_MAX, BARS_MIN, BARS_MAX,
  EX_MIN, EX_MAX, EX_MAX_LETTERS, TAP_MAX_HISTORY, TAP_RESET_MS,
} from '../constants.js';
import { loadSettings, saveSettings, loadUrlParams } from '../storage.js';
import { useDrumTimer } from '../useDrumTimer.js';
import { useLongPress, useSwipeInput } from '../useInteraction.js';
import { NumpadPopup, BarPickerPopup, fmt, numToLetter, fmtEx } from './NumpadComponents.jsx';
import { BarProgress } from './BarProgress.jsx';
import { CompactSelector } from './CompactSelector.jsx';
import '../styles.css';

function useNudge(setter, delta) {
  const intervalRef = useRef(null);
  const stop = () => {
    clearTimeout(intervalRef.current);
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  };
  const start = () => {
    const step = () => setter(v => {
      const next = Math.round((v + delta) * 100) / 100;
      return delta < 0 ? Math.max(0, next) : Math.min(1, next);
    });
    step();
    intervalRef.current = setTimeout(() => {
      intervalRef.current = setInterval(step, 80);
    }, 400);
  };
  useEffect(() => () => stop(), []);
  return { onMouseDown: start, onMouseUp: stop, onMouseLeave: stop, onTouchStart: (e) => { e.preventDefault(); start(); }, onTouchEnd: stop };
}

function VolPopup({ volBtnRef, volume, setVolume, subdivVol, setSubdivVol, subdivVol2, setSubdivVol2, subdivision }) {
  const [style, setStyle] = useState({});
  useEffect(() => {
    if (volBtnRef.current) {
      const rect = volBtnRef.current.getBoundingClientRect();
      setStyle({
        position: 'fixed',
        right: window.innerWidth - rect.right,
        bottom: window.innerHeight - rect.top + 6,
        zIndex: 51,
      });
    }
  }, []);
  const volDown  = useNudge(setVolume,    -0.05);
  const volUp    = useNudge(setVolume,     0.05);
  const subDown  = useNudge(setSubdivVol, -0.05);
  const subUp    = useNudge(setSubdivVol,  0.05);
  const sub2Down = useNudge(setSubdivVol2, -0.05);
  const sub2Up   = useNudge(setSubdivVol2,  0.05);
  const subdiv8Label  = subdivision === 3 ? 'Triplet' : '8th';
  return (
    <div className="vol-slider-row" style={style}>
      <div className="vol-slider-item">
        <span>Master</span>
        <button className="vol-nudge-btn" {...volDown}>−</button>
        <input type="range" min={0} max={1} step={0.05} value={volume} onChange={e => setVolume(Number(e.target.value))} />
        <button className="vol-nudge-btn" {...volUp}>+</button>
      </div>
      {subdivision > 1 && (
        <div className="vol-slider-item">
          <span>{subdivision === 4 ? '8th' : subdiv8Label}</span>
          <button className="vol-nudge-btn" {...subDown}>−</button>
          <input type="range" min={0} max={1} step={0.05} value={subdivVol} onChange={e => setSubdivVol(Number(e.target.value))} />
          <button className="vol-nudge-btn" {...subUp}>+</button>
        </div>
      )}
      {subdivision === 4 && (
        <div className="vol-slider-item">
          <span>16th</span>
          <button className="vol-nudge-btn" {...sub2Down}>−</button>
          <input type="range" min={0} max={1} step={0.05} value={subdivVol2} onChange={e => setSubdivVol2(Number(e.target.value))} />
          <button className="vol-nudge-btn" {...sub2Up}>+</button>
        </div>
      )}
    </div>
  );
}

function BpmAutoPopup({
  mode, bpm, bpmAuto, setBpmAuto,
  bpmAutoStep, setBpmAutoStep, bpmAutoDir, setBpmAutoDir,
  bpmAutoTrigger, setBpmAutoTrigger,
  bpmAutoBarInterval, setBpmAutoBarInterval,
  bpmAutoSecInterval, setBpmAutoSecInterval,
  bpmAutoRandom, setBpmAutoRandom, bpmAutoMin, setBpmAutoMin, bpmAutoMax, setBpmAutoMax,
  anchorRef, onClose,
}) {
  const [popupStyle, setPopupStyle] = useState({});

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const popupWidth = 260;
      const centreLeft = Math.round((window.innerWidth - popupWidth) / 2);
      const anchorLeft = Math.min(rect.left, window.innerWidth - popupWidth - 8);
      setPopupStyle({
        left: Math.max(8, window.innerWidth < 500 ? centreLeft : anchorLeft),
        bottom: window.innerHeight - rect.top + 6,
      });
    }
    // Seed random range from current BPM each time popup opens
    const halfSpan = Math.round(bpm * 0.035);
    setBpmAutoMin(Math.max(BPM_MIN, bpm - halfSpan));
    setBpmAutoMax(Math.min(BPM_MAX, bpm + halfSpan));
    // In Metronome mode, 'set' trigger is invalid — default to 'bars'
    if (isMetronome && bpmAutoTrigger === 'set') setBpmAutoTrigger('bars');
  }, []);

  const stepInc = () => setBpmAutoStep(s => Math.min(10, s + 1));
  const stepDec = () => setBpmAutoStep(s => Math.max(1, s - 1));
  const stepIncHandlers = useLongPressSimple(stepInc);
  const stepDecHandlers = useLongPressSimple(stepDec);

  const activeInterval = bpmAutoTrigger === 'seconds' ? bpmAutoSecInterval : bpmAutoBarInterval;
  const setActiveInterval = bpmAutoTrigger === 'seconds' ? setBpmAutoSecInterval : setBpmAutoBarInterval;
  const intervalMax = bpmAutoTrigger === 'seconds' ? 3600 : 999;
  const intervalInc = () => setActiveInterval(s => Math.min(intervalMax, s + 1));
  const intervalDec = () => setActiveInterval(s => Math.max(1, s - 1));
  const intervalIncHandlers = useLongPressSimple(intervalInc);
  const intervalDecHandlers = useLongPressSimple(intervalDec);

  const rangeMinInc = () => setBpmAutoMin(v => Math.min(bpmAutoMax, v + 1));
  const rangeMinDec = () => setBpmAutoMin(v => Math.max(BPM_MIN, v - 1));
  const rangeMaxInc = () => setBpmAutoMax(v => Math.min(BPM_MAX, Math.min(bpmAutoMin + 8, v + 1)));
  const rangeMaxDec = () => setBpmAutoMax(v => Math.max(bpmAutoMin, v - 1));
  const rangeMinIncHandlers = useLongPressSimple(rangeMinInc);
  const rangeMinDecHandlers = useLongPressSimple(rangeMinDec);
  const rangeMaxIncHandlers = useLongPressSimple(rangeMaxInc);
  const rangeMaxDecHandlers = useLongPressSimple(rangeMaxDec);

  const isMetronome = mode === MODE_CLICKONLY;

  return ReactDOM.createPortal(
    <>
      <div className="bpm-auto-backdrop" onClick={onClose} />
      <div className="bpm-auto-popup" style={popupStyle}>

        {/* Master toggle — prominent header */}
        <button
          className={`bpm-auto-master-toggle${bpmAuto ? " active" : ""}`}
          onClick={() => setBpmAuto(v => !v)}
        >
          Auto BPM
        </button>

        {/* Trigger label — infinite modes */}
        {!isMetronome && (
          <div className="bpm-auto-trigger-label">Changes every set</div>
        )}

        <div className={bpmAuto ? "bpm-auto-inner" : "bpm-auto-disabled"}>

        {/* Trigger interval — Metronome only */}
        {isMetronome && (
          <div className="bpm-auto-row">
            <span className="bpm-auto-label">Every</span>
            <div className="bpm-auto-stepper">
              <button className="bpm-auto-step-btn left" {...intervalDecHandlers}>−</button>
              <span className="bpm-auto-step-val">
                {activeInterval}{bpmAutoTrigger === 'seconds' ? 's' : ''}
              </span>
              <button className="bpm-auto-step-btn right" {...intervalIncHandlers}>+</button>
            </div>
            <div className="bpm-auto-unit-row">
              <button className={`sel-btn${bpmAutoTrigger === 'bars' ? " active" : ""}`}
                onClick={() => setBpmAutoTrigger('bars')}>bars</button>
              <button className={`sel-btn${bpmAutoTrigger === 'seconds' ? " active" : ""}`}
                onClick={() => setBpmAutoTrigger('seconds')}>sec</button>
            </div>
          </div>
        )}

        {/* Step / direction — primary controls */}
        {!bpmAutoRandom && (
          <div className="bpm-auto-row">
            <span className="bpm-auto-label">Step</span>
            <div className="bpm-auto-stepper">
              <button className="bpm-auto-step-btn left" {...stepDecHandlers}>−</button>
              <span className="bpm-auto-step-val">{bpmAutoStep}</span>
              <button className="bpm-auto-step-btn right" {...stepIncHandlers}>+</button>
            </div>
            <div className="bpm-auto-unit-row">
              <button className={`sel-btn${bpmAutoDir === 'up' ? " active" : ""}`}
                onClick={() => setBpmAutoDir('up')}>▲ Up</button>
              <button className={`sel-btn${bpmAutoDir === 'down' ? " active" : ""}`}
                onClick={() => setBpmAutoDir('down')}>▼ Down</button>
            </div>
          </div>
        )}

        {/* Random — secondary section, Shuffle/Sequence ∞ only */}
        {!isMetronome && (
          <div className="bpm-auto-secondary">
            <button className={`bpm-auto-random-toggle${bpmAutoRandom ? " active" : ""}`}
              onClick={() => setBpmAutoRandom(v => !v)}>
              {bpmAutoRandom ? "✓ Random tempo" : "Random tempo"}
            </button>
            {bpmAutoRandom && (
              <div className="bpm-auto-row" style={{ marginTop: '0.4rem' }}>
                <span className="bpm-auto-label">Min</span>
                <div className="bpm-auto-stepper">
                  <button className="bpm-auto-step-btn left" {...rangeMinDecHandlers}>−</button>
                  <span className="bpm-auto-step-val">{bpmAutoMin}</span>
                  <button className="bpm-auto-step-btn right" {...rangeMinIncHandlers}>+</button>
                </div>
                <span className="bpm-auto-label">Max</span>
                <div className="bpm-auto-stepper">
                  <button className="bpm-auto-step-btn left" {...rangeMaxDecHandlers}>−</button>
                  <span className="bpm-auto-step-val">{bpmAutoMax}</span>
                  <button className="bpm-auto-step-btn right" {...rangeMaxIncHandlers}>+</button>
                </div>
              </div>
            )}
          </div>
        )}

        </div>{/* end bpm-auto-disabled wrapper */}

      </div>
    </>,
    document.body
  );
}

function useLongPressSimple(callback) {
  const timerRef = useRef(null);
  const start = (e) => {
    e.preventDefault();
    callback();
    timerRef.current = setTimeout(() => {
      timerRef.current = setInterval(callback, 80);
    }, 400);
  };
  const stop = () => {
    if (timerRef.current) { clearInterval(timerRef.current); clearTimeout(timerRef.current); timerRef.current = null; }
  };
  return { onPointerDown: start, onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop };
}

function SubdivSVG({ value }) {
  if (value === 1) return (
    <svg viewBox="0 0 16 36" className="subdiv-svg">
      <ellipse cx="8" cy="30" rx="5" ry="3.2" transform="rotate(-18,8,30)" fill="currentColor"/>
      <line x1="12.5" y1="28" x2="12.5" y2="4" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
  if (value === 2) return (
    <svg viewBox="0 0 30 36" className="subdiv-svg">
      <ellipse cx="6"  cy="30" rx="5" ry="3.2" transform="rotate(-18,6,30)"  fill="currentColor"/>
      <ellipse cx="21" cy="30" rx="5" ry="3.2" transform="rotate(-18,21,30)" fill="currentColor"/>
      <line x1="10.5" y1="27.5" x2="10.5" y2="4" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="25.5" y1="27.5" x2="25.5" y2="4" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="10.5" y1="4"    x2="25.5" y2="4" stroke="currentColor" strokeWidth="2.5"/>
    </svg>
  );
  if (value === 3) return (
    <svg viewBox="0 -10 46 46" className="subdiv-svg">
      <ellipse cx="6"  cy="30" rx="5" ry="3.2" transform="rotate(-18,6,30)"  fill="currentColor"/>
      <ellipse cx="21" cy="30" rx="5" ry="3.2" transform="rotate(-18,21,30)" fill="currentColor"/>
      <ellipse cx="36" cy="30" rx="5" ry="3.2" transform="rotate(-18,36,30)" fill="currentColor"/>
      <line x1="10.5" y1="27.5" x2="10.5" y2="4" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="25.5" y1="27.5" x2="25.5" y2="4" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="40.5" y1="27.5" x2="40.5" y2="4" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="10.5" y1="4"    x2="40.5" y2="4" stroke="currentColor" strokeWidth="2.5"/>
      <path d="M10.5,-2 L10.5,-5 L40.5,-5 L40.5,-2" fill="none" stroke="currentColor" strokeWidth="1.2"/>
      <text x="25.5" y="-5" textAnchor="middle" fontSize="7" fill="currentColor" dominantBaseline="auto">3</text>
    </svg>
  );
  return (
    <svg viewBox="0 0 46 36" className="subdiv-svg">
      <ellipse cx="6"  cy="30" rx="5" ry="3.2" transform="rotate(-18,6,30)"  fill="currentColor"/>
      <ellipse cx="18" cy="30" rx="5" ry="3.2" transform="rotate(-18,18,30)" fill="currentColor"/>
      <ellipse cx="30" cy="30" rx="5" ry="3.2" transform="rotate(-18,30,30)" fill="currentColor"/>
      <ellipse cx="42" cy="30" rx="5" ry="3.2" transform="rotate(-18,42,30)" fill="currentColor"/>
      <line x1="10.5" y1="27.5" x2="10.5" y2="4" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="22.5" y1="27.5" x2="22.5" y2="4" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="34.5" y1="27.5" x2="34.5" y2="4" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="46.5" y1="27.5" x2="46.5" y2="4" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="10.5" y1="4"    x2="46.5" y2="4" stroke="currentColor" strokeWidth="2.5"/>
      <line x1="10.5" y1="9"    x2="46.5" y2="9" stroke="currentColor" strokeWidth="2.5"/>
    </svg>
  );
}

function defaultBeatStates(timeSigLabel) {
  const sig = TIME_SIGS.find(s => s.label === timeSigLabel) ?? TIME_SIGS[2];
  return Array.from({ length: sig.beats }, (_, i) => i === 0 ? 'accent' : 'normal');
}

export function App() {
  const [saved] = useState(() => ({ ...(loadSettings() || {}), ...(loadUrlParams() || {}) }));

  const [running,         setRunning]         = useState(false);
  const [paused,          setPaused]          = useState(false);
  const [resuming,        setResuming]        = useState(false);
  const [looping,         setLooping]         = useState(false);
  const [bpm,             setBpm]             = useState(() => saved?.bpm ?? 80);
  const [timeSig,         setTimeSig]         = useState(() => TIME_SIGS.find(t => t.label === saved?.timeSig) ?? TIME_SIGS[2]);
  const [barsPerExercise, setBarsPerExercise] = useState(() => saved?.barsPerExercise ?? 4);
  const [exerciseLength,  setExerciseLength]  = useState(() => saved?.exerciseLength ?? 1);
  const [minEx,           setMinEx]           = useState(() => saved?.minEx ?? 1);
  const [maxEx,           setMaxEx]           = useState(() => saved?.maxEx ?? 4);
  const [countInBars,     setCountInBars]     = useState(() => saved?.countInBars ?? 1);
  const [countInEvery,    setCountInEvery]    = useState(() => saved?.countInEvery ?? true);
  const [mode,            setMode]            = useState(() => saved?.mode ?? MODE_FULLSET);
  const [sets,            setSets]            = useState(() => saved?.sets ?? 1);
  const [displayMode,     setDisplayMode]     = useState(() => saved?.displayMode ?? 'bars');
  const setsByMode = useRef({ [MODE_FULLSET]: saved?.sets ?? 1, [MODE_SEQUENTIAL]: saved?.sets ?? 1 });
  const [elapsedSeconds,  setElapsedSeconds]  = useState(0);
  const timerStartRef  = useRef(null);
  const elapsedAccumRef = useRef(0);
  const [volume,          setVolume]          = useState(() => saved?.volume ?? 1.0);
  const [subdivVol,       setSubdivVol]       = useState(() => saved?.subdivVol ?? 0.7);
  const [subdivVol2,      setSubdivVol2]      = useState(() => saved?.subdivVol2 ?? 0.7);
  const [exercise,        setExercise]        = useState(null);
  const [nextEx,          setNextEx]          = useState(null);
  const [setCount,        setSetCount]        = useState(1);
  const [isFirstExOfSet,  setIsFirstExOfSet]  = useState(false);
  const [tapped,          setTapped]          = useState(false);
  const [showVolume,      setShowVolume]      = useState(false);
  const [showHelp,        setShowHelp]        = useState(false);
  const [openSelector,    setOpenSelector]    = useState(null);
  const [helpScrolledToEnd, setHelpScrolledToEnd] = useState(false);
  const [helpNeedsScroll, setHelpNeedsScroll] = useState(false);
  const helpOverlayRef = useRef(null);
  const volBtnRef = useRef(null);
  const [helpPulse,       setHelpPulse]       = useState(() => {
    try { return !localStorage.getItem('shuffle_seen_help'); } catch { return false; }
  });
  const helpPulseTimer = useRef(null);
  const [setComplete,     setSetComplete]     = useState(false);
  const [barFlash,        setBarFlash]        = useState(false);
  const [numpadOpen,      setNumpadOpen]      = useState(null); // null | 'min' | 'max'
  const [exMode,          setExMode]          = useState(() => saved?.exMode ?? 'range');
  const [pickedNums,      setPickedNums]      = useState(() => Array.isArray(saved?.pickedNums) ? saved.pickedNums.map(Number) : []);
  const [pickerOpen,      setPickerOpen]      = useState(false);
  const [showMuteHint,    setShowMuteHint]    = useState(false);
  const [subdivision,     setSubdivision]     = useState(() => saved?.subdivision ?? 1);
  const [beatStates,      setBeatStates]      = useState(() => Array.isArray(saved?.beatStates) ? saved.beatStates : defaultBeatStates(saved?.timeSig ?? '4/4'));
  const [letterMode,          setLetterMode]          = useState(() => saved?.letterMode ?? false);
  const [showLetterModePopup, setShowLetterModePopup] = useState(false);
  const letterModeSeenRef = useRef(!!localStorage.getItem('shuffle_lm_seen'));
  const letterModeMountedRef = useRef(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [bpmAuto,          setBpmAuto]          = useState(() => saved?.bpmAuto ?? false);
  const [bpmAutoStep,        setBpmAutoStep]        = useState(() => saved?.bpmAutoStep ?? 2);
  const [bpmAutoDir,         setBpmAutoDir]         = useState(() => saved?.bpmAutoDir ?? 'up');
  const [bpmAutoTrigger,     setBpmAutoTrigger]     = useState(() => saved?.bpmAutoTrigger ?? 'set');
  const [bpmAutoBarInterval, setBpmAutoBarInterval] = useState(() => saved?.bpmAutoBarInterval ?? 8);
  const [bpmAutoSecInterval, setBpmAutoSecInterval] = useState(() => saved?.bpmAutoSecInterval ?? 30);
  const [bpmAutoRandom,      setBpmAutoRandom]      = useState(() => saved?.bpmAutoRandom ?? false);
  const [bpmAutoMin,         setBpmAutoMin]         = useState(bpm);
  const [bpmAutoMax,         setBpmAutoMax]         = useState(bpm);
  const [bpmAutoOpen,      setBpmAutoOpen]      = useState(false);
  const autoBarCountRef  = useRef(0);
  const autoTimerRef     = useRef(null);
  const bpmGearBtnRef    = useRef(null);
  const appToastTimer = useRef(null);
  const [appToastMsg, setAppToastMsg] = useState(null);
  const [appToastKey, setAppToastKey] = useState(0);
  const showAppToast = (msg) => {
    setAppToastMsg(msg);
    setAppToastKey(k => k + 1);
    if (appToastTimer.current) clearTimeout(appToastTimer.current);
    appToastTimer.current = setTimeout(() => setAppToastMsg(null), 1800);
  };
  const tapTimes = useRef([]);
  const wakeLock = useRef(null);

  useEffect(() => {
    saveSettings({ bpm, timeSig: timeSig.label, barsPerExercise, exerciseLength,
                   minEx, maxEx, countInBars, countInEvery, mode, sets, displayMode, volume,
                   exMode, pickedNums, letterMode,
                   subdivision, beatStates, subdivVol, subdivVol2,
                   bpmAuto, bpmAutoStep, bpmAutoDir, bpmAutoTrigger,
                   bpmAutoBarInterval, bpmAutoSecInterval, bpmAutoRandom });
  }, [bpm, timeSig, barsPerExercise, exerciseLength, minEx, maxEx, countInBars, countInEvery, mode, sets, displayMode, volume, exMode, pickedNums, letterMode, subdivision, beatStates, subdivVol, subdivVol2, bpmAuto, bpmAutoStep, bpmAutoDir, bpmAutoTrigger, bpmAutoBarInterval, bpmAutoSecInterval, bpmAutoRandom]);

  useEffect(() => {
    if (window.location.search) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    setBeatStates(defaultBeatStates(timeSig.label));
  }, [timeSig]);

  // When switching to 16ths, clamp subdivVol2 to subdivVol so 16ths can't be louder than 8ths
  useEffect(() => {
    if (subdivision === 4) {
      setSubdivVol2(v => Math.min(v, subdivVol));
    }
  }, [subdivision]);

  useEffect(() => {
    if (!letterModeMountedRef.current) { letterModeMountedRef.current = true; return; }
    setMinEx(1); setMaxEx(4);
    setPickedNums(prev => prev.filter(n => n <= EX_MAX_LETTERS));
    if (!letterModeSeenRef.current) {
      letterModeSeenRef.current = true;
      localStorage.setItem('shuffle_lm_seen', '1');
      setShowLetterModePopup(true);
    }
  }, [letterMode]);

  useEffect(() => {
    if (!helpPulse) return;
    helpPulseTimer.current = setTimeout(() => {
      setHelpPulse(false);
      try { localStorage.setItem('shuffle_seen_help', '1'); } catch {}
    }, 10000);
    return () => clearTimeout(helpPulseTimer.current);
  }, []);

  useEffect(() => {
    if (!showHelp) { setHelpNeedsScroll(false); return; }
    requestAnimationFrame(() => {
      const el = helpOverlayRef.current;
      if (el) setHelpNeedsScroll(el.scrollHeight > el.clientHeight);
    });
  }, [showHelp]);

  useEffect(() => {
    const req = async () => {
      if ("wakeLock" in navigator)
        try { wakeLock.current = await navigator.wakeLock.request("screen"); } catch {}
    };
    const rel = async () => {
      if (wakeLock.current) { try { await wakeLock.current.release(); } catch {} wakeLock.current = null; }
    };
    if (running && !paused) req(); else rel();
    return () => rel();
  }, [running, paused]);

  const handleNewExercise  = useCallback((n) => { setExercise(n); }, []);
  const handleNextExercise = useCallback((n) => { setNextEx(n); }, []);

  const applyBpmStep = useCallback(() => {
    if (bpmAutoRandom && mode !== MODE_CLICKONLY) {
      const lo = Math.min(bpmAutoMin, bpmAutoMax);
      const hi = Math.max(bpmAutoMin, bpmAutoMax);
      setBpm(Math.floor(Math.random() * (hi - lo + 1)) + lo);
    } else {
      const delta = bpmAutoDir === 'up' ? bpmAutoStep : -bpmAutoStep;
      setBpm(b => clampBpm(b + delta));
    }
  }, [bpmAutoRandom, mode, bpmAutoMin, bpmAutoMax, bpmAutoDir, bpmAutoStep]);

  const handleSetComplete  = useCallback(() => {
    setRunning(false); setPaused(false); setLooping(false); setResuming(false);
    setExercise(null); setNextEx(null);
    setSetCount(1); setIsFirstExOfSet(false);
    setSetComplete(true);
    setTimeout(() => setSetComplete(false), SET_COMPLETE_DISPLAY_MS);
  }, []);

  const handleSetLoop = useCallback(() => {
    if (bpmAuto) applyBpmStep();
    setSetCount(c => c + 1);
    setIsFirstExOfSet(true);
  }, [bpmAuto, applyBpmStep]);

  const { currentBeat, currentBar, currentSubdiv, phase, flashOn, countInBeat, isResuming } = useDrumTimer({
    bpm,
    beatsPerBar: timeSig.beats,
    barsPerExercise: barsPerExercise * (exMode === 'pick' ? 1 : exerciseLength),
    minEx, maxEx,
    onNewExercise: handleNewExercise,
    onNextExercise: handleNextExercise,
    onSetComplete: handleSetComplete,
    onSetLoop: handleSetLoop,
    running, paused, resuming,
    countInBars,
    countInEveryRound: countInEvery,
    mode, volume, looping, infinite: sets === '∞' || (typeof sets === 'number' && setCount < sets), setComplete,
    exMode, pickedNums, subdivision, beatStates, subdivVol, subdivVol2,
  });

  useEffect(() => {
    if (!showMuteHint || phase !== "playing") return;
    const t = setTimeout(() => setShowMuteHint(false), 400);
    return () => clearTimeout(t);
  }, [phase, showMuteHint]);

  // Track whether we've entered playing state since isFirstExOfSet was set
  const hasPlayedFirstBar = useRef(false);
  useEffect(() => {
    if (isFirstExOfSet && phase === "playing") hasPlayedFirstBar.current = true;
    if (!isFirstExOfSet) hasPlayedFirstBar.current = false;
  }, [isFirstExOfSet, phase]);

  // Clear set label after the first bar of the new set
  useEffect(() => {
    const bpe = barsPerExercise * (exMode === 'pick' ? 1 : exerciseLength);
    if (!isFirstExOfSet) return;
    if (phase === "playing" && currentBar > 0) { setIsFirstExOfSet(false); return; }
    if (bpe === 1 && phase === "countin" && hasPlayedFirstBar.current) { setIsFirstExOfSet(false); return; }
  }, [isFirstExOfSet, phase, currentBar, barsPerExercise, exMode, exerciseLength]);

  const handleStart = () => {
    if (!localStorage.getItem('muteHintSeen')) {
      localStorage.setItem('muteHintSeen', '1');
      setShowMuteHint(true);
    }
    setSetComplete(false);
    setExercise(null); setNextEx(null);
    setSetCount(1); setIsFirstExOfSet(false);
    autoBarCountRef.current = 0;
    setPaused(false); setLooping(false); setResuming(false); setRunning(true);
  };

  const handleStop = () => {
    setRunning(false); setPaused(false); setLooping(false); setResuming(false);
    setExercise(null); setNextEx(null); setSetComplete(false);
    setSetCount(1); setIsFirstExOfSet(false);
    timerStartRef.current = null; elapsedAccumRef.current = 0; setElapsedSeconds(0);
    autoBarCountRef.current = 0;
    clearInterval(autoTimerRef.current); autoTimerRef.current = null;
  };

  // Metronome bar-count BPM automation
  useEffect(() => {
    if (!bpmAuto || mode !== MODE_CLICKONLY || phase !== "playing" || paused) return;
    if (bpmAutoTrigger !== "bars" && bpmAutoTrigger !== "set") return;
    autoBarCountRef.current += 1;
    if (autoBarCountRef.current >= bpmAutoBarInterval) {
      autoBarCountRef.current = 0;
      applyBpmStep();
    }
  }, [exercise]);

  // Metronome time-based BPM automation
  useEffect(() => {
    if (!bpmAuto || mode !== MODE_CLICKONLY || phase !== "playing" || paused || bpmAutoTrigger !== "seconds") {
      clearInterval(autoTimerRef.current); autoTimerRef.current = null;
      return;
    }
    const intervalMs = Math.max(1, bpmAutoSecInterval) * 1000;
    autoTimerRef.current = setInterval(applyBpmStep, intervalMs);
    return () => { clearInterval(autoTimerRef.current); autoTimerRef.current = null; };
  }, [bpmAuto, mode, phase, paused, bpmAutoTrigger, bpmAutoSecInterval, applyBpmStep]);

  // Reset bar counter when trigger type changes
  useEffect(() => { autoBarCountRef.current = 0; }, [bpmAutoTrigger]);

  const handlePause = () => {
    if (paused) {
      setResuming(true);
      setPaused(false);
    } else {
      setResuming(false);
      setPaused(true);
    }
  };

  const handleLoop = () => setLooping(l => !l);

  useEffect(() => {
    if (mode !== MODE_CLICKONLY || displayMode !== 'timer') {
      timerStartRef.current = null; elapsedAccumRef.current = 0; setElapsedSeconds(0);
      return;
    }
    if (phase === "playing" && !paused) {
      timerStartRef.current = Date.now();
      const id = setInterval(() => {
        const elapsed = elapsedAccumRef.current + Math.floor((Date.now() - timerStartRef.current) / 1000);
        setElapsedSeconds(elapsed);
      }, 500);
      return () => clearInterval(id);
    } else if (paused && timerStartRef.current !== null) {
      elapsedAccumRef.current += Math.floor((Date.now() - timerStartRef.current) / 1000);
      timerStartRef.current = null;
    }
  }, [phase, paused, mode, displayMode]);

  useEffect(() => {
    if (!isResuming && resuming) setResuming(false);
  }, [isResuming, resuming]);

  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space" && e.target.tagName !== "INPUT") {
        e.preventDefault();
        if (!runningRef.current) {
          handleStart();
        } else if (pausedRef.current) {
          setResuming(true);
          setPaused(false);
        } else {
          setResuming(false);
          setPaused(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleTap = useCallback(() => {
    if (running) return;        const now = performance.now();
    const times = tapTimes.current;
    while (times.length > 0 && now - times[times.length - 1] > TAP_RESET_MS) { times.length = 0; }
    times.push(now);
    if (times.length > TAP_MAX_HISTORY) times.shift();
    if (times.length >= 2) {
      const intervals = [];
      for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      setBpm(Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(60000 / avg))));
    }
    setTapped(true);
    setTimeout(() => setTapped(false), 100);
  }, [running]);

  const clampBpm = (v) => Math.min(BPM_MAX, Math.max(BPM_MIN, v));
  const incBpm  = useCallback(() => setBpm(b => clampBpm(b + 1)), []);
  const decBpm  = useCallback(() => setBpm(b => clampBpm(b - 1)), []);
  const cycleBeatState = useCallback((i) => {
    setBeatStates(prev => {
      const next = [...prev];
      const order = ['accent', 'normal', 'silent'];
      next[i] = order[(order.indexOf(prev[i]) + 1) % 3];
      return next;
    });
  }, []);
  const incBars   = useCallback(() => { if (!running) setBarsPerExercise(b => Math.min(BARS_MAX, b + 1)); }, [running]);
  const decBars   = useCallback(() => { if (!running) setBarsPerExercise(b => Math.max(BARS_MIN, b - 1)); }, [running]);
  const bpmIncHandlers  = useLongPress(incBpm);
  const bpmDecHandlers  = useLongPress(decBpm);
  const barsIncHandlers = useLongPress(incBars);
  const barsDecHandlers = useLongPress(decBars);

  useEffect(() => {
    if (phase === "playing" && currentBeat === 0 && !paused) {
      setBarFlash(true);
      const t = setTimeout(() => setBarFlash(false), 120);
      return () => clearTimeout(t);
    }
  }, [currentBar, currentBeat, phase, paused]);


  const exInputDisabled = running || mode === MODE_CLICKONLY;
  const minSwipeHandlers = useSwipeInput({
    disabled: exInputDisabled,
    onSwipeUp:   () => { const v = Math.min(EX_MAX, minEx + 1); setMinEx(v); },
    onSwipeDown: () => { const v = Math.max(EX_MIN, minEx - 1); setMinEx(v); },
    onTap: () => setNumpadOpen('min'),
  });
  const maxSwipeHandlers = useSwipeInput({
    disabled: exInputDisabled,
    onSwipeUp:   () => { const v = Math.min(EX_MAX, maxEx + 1); setMaxEx(v); },
    onSwipeDown: () => { const v = Math.max(EX_MIN, maxEx - 1); setMaxEx(v); },
    onTap: () => setNumpadOpen('max'),
  });

  const validRange   = mode === MODE_CLICKONLY ? true : exMode === 'pick' ? pickedNums.length >= 1 : minEx <= maxEx;
  const totalBars    = barsPerExercise * exerciseLength;
  const currentRound = Math.floor(currentBar / exerciseLength) + 1;
  const progress     = totalBars > 1 ? currentBar / (totalBars - 1) : 1;

  const nextOpacity = nextEx !== null && !looping && (phase === "playing" || phase === "countin")
    ? phase === "countin"
      ? 1
      : countInEvery
        ? barsPerExercise <= 1 ? 1
          : currentRound >= barsPerExercise - 1
            ? currentRound === barsPerExercise - 1 ? 0.25 : 1
            : 0
        : totalBars === 1 ? 1
        : Math.pow(progress, 2)
    : 0;

  const volIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="5" width="3" height="6" fill="currentColor"/>
      <polygon points="4,5 8,2 8,14 4,11" fill="currentColor"/>
      <path d="M10 5.5 C11.5 6.5 11.5 9.5 10 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      <path d="M11.5 3.5 C13.5 5 13.5 11 11.5 12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
    </svg>
  );

  const modeSummary = (mode === MODE_FULLSET ? "shuffle" : mode === MODE_SEQUENTIAL ? "sequence" : "metronome") + (sets === '∞' && mode !== MODE_CLICKONLY ? " ∞" : "");


  return (
    <div className="app">

      <div className="rotate-overlay">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f5c842" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <path d="M9 21h6" />
          <path d="M17 8 L21 4 M21 4 L17 0 M21 4 H13" />
        </svg>
        <p>Please rotate your device</p>
      </div>

      <div className="app-header">
      <div className="app-header-row">
        <div className="app-header-spacer" />
        <div className="app-header-text">
          <div className="app-title">Shuffle</div>
        </div>
        <div className="settings-menu-wrap app-header-spacer">
            <button className={`settings-menu-btn${helpPulse ? ' settings-menu-btn-pulse' : ''}`}
              onClick={() => setSettingsMenuOpen(v => !v)}>☰</button>
            {settingsMenuOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 49, background: "rgba(0,0,0,0.4)" }}
                     onClick={() => setSettingsMenuOpen(false)} />
                <div className="settings-menu-panel">
                  <button className="settings-menu-item settings-menu-item--help" onClick={() => {
                    setSettingsMenuOpen(false);
                    setShowHelp(true); setHelpScrolledToEnd(false);
                    if (helpPulse) {
                      setHelpPulse(false);
                      clearTimeout(helpPulseTimer.current);
                      try { localStorage.setItem('shuffle_seen_help', '1'); } catch {}
                    }
                  }}>How to use</button>
                  <button className="settings-menu-item" onClick={() => {
                    setSettingsMenuOpen(false);
                    const next = !letterMode;
                    setLetterMode(next);
                    showAppToast(next ? "Letter mode" : "Number mode");
                    if (next && !letterModeSeenRef.current) {
                      letterModeSeenRef.current = true;
                      try { localStorage.setItem('shuffle_lm_seen', '1'); } catch {}
                      setShowLetterModePopup(true);
                    }
                  }}>{letterMode ? "Turn letter mode off" : "Turn letter mode on"}</button>
                  <button className="settings-menu-item" onClick={() => {
                    setSettingsMenuOpen(false);
                    const p = new URLSearchParams();
                    p.set("bpm",    String(bpm));
                    p.set("sig",    timeSig.label);
                    p.set("exlen",  String(exerciseLength));
                    if (mode !== MODE_CLICKONLY) {
                      if (exMode === "pick" && pickedNums.length > 0) {
                        p.set("picks", pickedNums.join(","));
                      } else {
                        p.set("min", String(minEx));
                        p.set("max", String(maxEx));
                      }
                      p.set("rounds", String(barsPerExercise));
                    }
                    p.set("cib",  String(countInBars));
                    if (countInEvery) p.set("cie", "1");
                    p.set("mode", mode);
                    if (sets !== 1 && mode !== MODE_CLICKONLY) p.set("sets", String(sets));
                    if (displayMode === 'timer' && mode === MODE_CLICKONLY) p.set("dm", "timer");
                    if (letterMode) p.set("lm", "1");
                    const url = `${window.location.origin}${window.location.pathname}?${p.toString()}`;
                    navigator.clipboard.writeText(url)
                      .then(() => showAppToast("Link copied!"))
                      .catch(() => showAppToast("Copy failed"));
                  }}>Share settings</button>
                  <button className="settings-menu-item settings-menu-item--destructive" onClick={() => {
                    setSettingsMenuOpen(false);
                    handleStop();
                    setBpm(80);
                    setTimeSig(TIME_SIGS[2]);
                    setBarsPerExercise(4);
                    setExerciseLength(1);
                    setMinEx(1);
                    setMaxEx(4);
                    setCountInBars(1);
                    setCountInEvery(true);
                    setMode(MODE_FULLSET);
                    setSets(1);
                    setDisplayMode('bars');
                    setsByMode.current = { [MODE_FULLSET]: 1, [MODE_SEQUENTIAL]: 1 };
                    setVolume(1.0);
                    setSubdivVol(0.7);
                    setSubdivVol2(0.7);
                    setExMode('range');
                    setPickedNums([]);
                    setLetterMode(false);
                    setSubdivision(1);
                    setBeatStates(defaultBeatStates('4/4'));
                    setBpmAuto(false);
                    showAppToast("Settings reset");
                  }}>Reset to defaults</button>
                </div>
              </>
            )}
        </div>
      </div>
      <div className="app-subtitle">practice randomiser and metronome for musicians</div>
      </div>

      {showHelp && (
        <>
          {(helpNeedsScroll && !helpScrolledToEnd) && <div className="help-scroll-fade" />}
          <div className="help-overlay" ref={helpOverlayRef}
            onClick={() => setShowHelp(false)}
            onScroll={(e) => {
              const el = e.currentTarget;
              const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
              setHelpScrolledToEnd(atEnd);
            }}>
            <div className="help-content" onClick={e => e.stopPropagation()}>
            <button className="help-close-x" onClick={() => setShowHelp(false)}>✕</button>
            <div className="help-title">How to use Shuffle</div>
            <div className="help-section">
              <h3>Set up</h3>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', listStyleType: 'disc' }}>
                <li>Choose your mode, then set BPM, time signature, exercise length, and rounds per exercise.</li>
                <li>Set your exercise range (swipe up/down to nudge) or switch to Pick to choose specific exercises.</li>
                <li>Tap Count in to set the count-in length — optionally enable it before every exercise.</li>
              </ul>
            </div>
            <div className="help-section">
              <h3>Modes</h3>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', listStyleType: 'disc' }}>
                <li>Shuffle — plays every exercise in random order, then stops. Use the Sets control to repeat or loop continuously (∞).</li>
                <li>Sequence — plays exercises in order, then stops. Use the Sets control to repeat or loop continuously (∞).</li>
                <li>Metronome — runs until stopped. Use the Display control to switch between bar counter and timer.</li>
              </ul>
            </div>
            <div className="help-section">
              <h3>BPM automation</h3>
              <p>Tap <strong>⚙&#xFE0E;</strong> next to BPM to open automation settings (available in Metronome and ∞ modes).</p>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', listStyleType: 'disc' }}>
                <li><strong>Shuffle/Sequence ∞</strong> — steps BPM up or down after each full set.</li>
                <li><strong>Metronome</strong> — steps every N bars or every N seconds.</li>
                <li><strong>Random</strong> (∞ only) — randomises BPM within a range instead of stepping.</li>
              </ul>
            </div>
            <div className="help-section">
              <h3>Loop / Pause / Stop</h3>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', listStyleType: 'disc' }}>
                <li>Loop — repeats the current exercise. Tap again to exit at the end of the current exercise.</li>
                <li>Pause — restarts the current exercise with a count-in on resume.</li>
                <li>Stop — ends the session and resets everything.</li>
              </ul>
            </div>
            <div className="help-section">
              <h3>Tips</h3>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', listStyleType: 'disc' }}>
                <li>If you can't hear anything, check your device isn't in silent mode.</li>
                <li>Keep the app on screen — audio may stop if you switch away or lock your device.</li>
              </ul>
            </div>
            <div className="help-section">
              <h3>Feedback</h3>
              <p>Found a bug or have a suggestion? <a href="mailto:hello@shuffleclick.com">Get in touch →</a></p>
            </div>
            <div className="help-section help-section-support">
              <h3>Support Shuffle</h3>
              <p>Enjoying Shuffle? Help keep it free and growing! ☕{" "}<a href="https://www.buymeacoffee.com/rossfarley" target="_blank" rel="noopener noreferrer">Support here →</a></p>
            </div>
            <button className="help-close-bottom" style={{ display: (!helpNeedsScroll || helpScrolledToEnd) ? 'block' : 'none' }} onClick={() => setShowHelp(false)}>Close</button>
          </div>
          </div>
        </>
      )}

      <div className={`display${mode === MODE_CLICKONLY ? " display--metro" : ""}`}>
        <div key={`${phase}-${isFirstExOfSet}-${setCount}`} className={`exercise-label${isFirstExOfSet && phase === "playing" && mode !== MODE_CLICKONLY ? " exercise-label--set" : ""}`}>
          {phase === "idle" ? (setComplete ? "\u00A0" : "ready") : mode === MODE_CLICKONLY ? (displayMode === 'timer' ? "time" : "bar") : isFirstExOfSet && phase === "playing" ? `set ${setCount}` : phase === "countin" ? "count in" : "exercise"}
        </div>

        {phase === "countin" ? (
          <div className="countdown-display">
            {countInBeat > 0 ? fmt(((countInBeat - 1) % timeSig.beats) + 1) : "--"}
          </div>
        ) : setComplete ? (
          <div className="exercise-number done">
            done
          </div>
        ) : (
          <div className={`exercise-number${flashOn && !looping ? " flash" : ""}${phase === "idle" ? " idle" : ""}${looping && phase === "playing" ? " looping" : ""}`}>
            {mode === MODE_CLICKONLY && displayMode === 'timer' && phase !== "idle"
              ? `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`
              : exercise !== null ? fmtEx(exercise, letterMode) : "--"}
          </div>
        )}

        {phase === "idle" ? (
          setComplete ? (
            <div className="idle-summary">&nbsp;</div>
          ) : mode === MODE_CLICKONLY ? null : (
            <div className="idle-summary">
              {exMode === 'pick'
                ? `${pickedNums.length === 0 ? 'no bars' : pickedNums.length > 4 ? `${pickedNums.length} exercises` : pickedNums.map(n => letterMode ? numToLetter(n) : String(n)).join(', ')} · ${barsPerExercise} round${barsPerExercise !== 1 ? "s" : ""} · ${modeSummary}`
                : `${letterMode ? numToLetter(minEx) : String(minEx)}–${letterMode ? numToLetter(maxEx) : String(maxEx)} · ${exerciseLength}-bar ex · ${barsPerExercise} round${barsPerExercise !== 1 ? "s" : ""} · ${modeSummary}`}
            </div>
          )
        ) : (
          <div key={nextEx} className="next-exercise" style={{ opacity: paused ? 1 : isResuming ? 1 : nextEx === -1 ? 1 : looping ? 1 : nextOpacity }}>
            {paused
              ? <span className="status-label">paused</span>
              : isResuming
                ? <><span className="next-label">resuming</span>{fmtEx(nextEx ?? exercise, letterMode)}</>
                : looping
                  ? <span className="status-label status-label--dim">looping</span>
                  : nextEx === -1 && phase === "playing"
                    ? <span className="status-label status-label--dim">last exercise</span>
                    : nextEx !== null && (phase === "playing" || phase === "countin")
                      ? <><span className="next-label">up next</span>{fmtEx(nextEx === -1 ? exercise : nextEx, letterMode)}</>
                      : "\u00A0"}
          </div>
        )}

        {!setComplete && (
          <div className={`beat-dots${mode === MODE_CLICKONLY ? " tappable" : ""}`}>
            {Array.from({ length: timeSig.beats }).map((_, i) => {
              const bState = mode === MODE_CLICKONLY ? (beatStates[i] ?? 'normal') : null;
              const isActive = phase === "playing" && !paused && currentBeat === i;
              return (
                <div
                  key={i}
                  className={[
                    'beat-dot',
                    phase === "idle" && mode !== MODE_CLICKONLY ? 'inactive' : '',
                    i === 0 ? 'beat1' : '',
                    isActive ? 'active' : '',
                    bState ? bState : '',
                  ].filter(Boolean).join(' ')}
                  onClick={mode === MODE_CLICKONLY ? () => cycleBeatState(i) : undefined}
                />
              );
            })}
          </div>
        )}
        {mode === MODE_CLICKONLY && subdivision > 1 && (
          <div className="subdiv-dots">
            {Array.from({ length: timeSig.beats * subdivision }).map((_, i) => {
              const beatIndex = Math.floor(i / subdivision);
              const subIndex = i % subdivision;
              const isActive = phase === "playing" && !paused && currentBeat === beatIndex && (subIndex === 0 ? true : currentSubdiv === subIndex);
              const isBeat = subIndex === 0;
              return (
                <div key={i} className={`subdiv-dot${isBeat ? ' beat' : ''}${isActive ? ' active' : ''}`} />
              );
            })}
          </div>
        )}

        {!setComplete && mode !== MODE_CLICKONLY && (
          <BarProgress
            barsPerExercise={barsPerExercise}
            currentRound={currentRound}
            currentBar={currentBar}
            exerciseLength={exerciseLength}
            looping={looping}
            phase={phase}
            countInBars={countInBars}
            countInBeat={countInBeat}
            beatsPerBar={timeSig.beats}
            barFlash={barFlash}
          />
        )}

        {showMuteHint && phase !== "idle" && (
          <div className={`mute-hint${phase !== "countin" ? " fading" : ""}`}>No sound? Check volume and silent mode.</div>
        )}

        {appToastMsg && <div key={appToastKey} className="app-toast">{appToastMsg}</div>}

      </div>

      <div className="controls">

        <div className="section-grid controls-grid">

          <div className={`control-group full-width${running ? " dimmed" : ""}`}>
            <label>Mode</label>
            <div className="selector-row">
              {[
                { label: "Shuffle",   value: MODE_FULLSET },
                { label: "Sequence",  value: MODE_SEQUENTIAL },
                { label: "Metronome", value: MODE_CLICKONLY },
              ].map(m => (
                <button key={m.value}
                  className={`sel-btn${mode === m.value ? " active" : ""}`}
                  onClick={() => {
                    if (m.value !== mode) {
                      if (mode === MODE_FULLSET || mode === MODE_SEQUENTIAL) {
                        setsByMode.current[mode] = sets;
                      }
                      setMode(m.value);
                      if (m.value === MODE_FULLSET || m.value === MODE_SEQUENTIAL) {
                        setSets(setsByMode.current[m.value] ?? 1);
                      } else {
                        setSets(1);
                      }
                    }
                  }} disabled={running}
                  >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className={`bpm-timesig-row${(mode === MODE_CLICKONLY || sets === '∞') ? " gear-visible" : ""}`}>
            <div className="control-group bpm-group">
              <label>BPM</label>
              <div className="bpm-widget-row">
                <div className="bpm-widget">
                  <button className="bpm-btn left" {...bpmDecHandlers}>−</button>
                  <div className={`bpm-tap${tapped ? " tapped" : ""}`}
                    onClick={!running ? handleTap : undefined}
                    onMouseDown={e => e.preventDefault()}
                    style={running ? { cursor: "default", pointerEvents: "none" } : {}}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                      <span>{bpm}</span>
                      {!running && <span className="bpm-tap-label">tap to set</span>}
                    </div>
                  </div>
                  <button className="bpm-btn right" {...bpmIncHandlers}>+</button>
                </div>
                {(mode === MODE_CLICKONLY || sets === '∞') && (
                  <button
                    ref={bpmGearBtnRef}
                    className={`bpm-gear-btn${bpmAuto ? " active" : ""}`}
                    onClick={() => setBpmAutoOpen(v => !v)}
                    title="BPM automation"
                  >⚙&#xFE0E;</button>
                )}
              </div>
            </div>

            <div className={`control-group timesig-group${running ? " dimmed" : ""}`}>
              <label>Time signature</label>
              <CompactSelector
                id="timeSig"
                value={timeSig}
                options={TIME_SIGS}
                onChange={setTimeSig}
                disabled={running}
                openSelector={openSelector}
                setOpenSelector={setOpenSelector}
                getLabel={ts => ts.label}
              />
            </div>
          </div>

          {/* Row: Count In + Subdivision (always, all modes) */}
          <div className={`control-group${running ? " dimmed" : ""}`}>
            <label>Count in</label>
            <CompactSelector
              id="countIn"
              value={countInBars}
              options={[1, 2, 4]}
              onChange={setCountInBars}
              disabled={running}
              openSelector={openSelector}
              setOpenSelector={setOpenSelector}
              getLabel={n => n === 1 ? "1 bar" : `${n} bars`}
              buttonLabel={`${countInBars === 1 ? "1 bar" : `${countInBars} bars`}${countInEvery && mode !== MODE_CLICKONLY ? " ✓" : ""}`}
              footer={
                <div className={`check-row${mode === MODE_CLICKONLY ? " disabled" : ""}`} style={{ width: '100%', padding: '0.1rem 0' }}>
                  <input type="checkbox" checked={countInEvery}
                    onChange={e => setCountInEvery(e.target.checked)} disabled={mode === MODE_CLICKONLY}
                    style={{ accentColor: "#ff4500", width: 18, height: 18 }} />
                  <span>Count in every exercise</span>
                </div>
              }
            />
          </div>

          <div className={`control-group${running ? " dimmed" : ""}`}>
            <label>Subdivision</label>
            <CompactSelector
              id="subdivision"
              value={subdivision}
              options={[1, 2, 3, 4]}
              onChange={setSubdivision}
              disabled={running}
              openSelector={openSelector}
              setOpenSelector={setOpenSelector}
              getLabel={n => ["♩", "♪♪", "triplet", "♬"][n - 1]}
              renderOption={n => <SubdivSVG value={n} />}
              buttonLabel={<SubdivSVG value={subdivision} />}
              popupClassName="subdiv-popup"
            />
          </div>

          {/* Exercises (col 1 on mobile, full-width on desktop) + ExLength (col 2 on mobile, col 3 row 1 on desktop) */}
          {mode !== MODE_CLICKONLY && (
            <div className={`control-group exercises-group${running ? " dimmed" : ""}`}>
              <label>Exercises</label>
              <div className="ex-control-row">
                {exMode === 'range' ? (
                  <div className="range-row">
                    <input type="text" readOnly value={letterMode ? numToLetter(minEx) : String(minEx)}
                      className={!validRange && exMode === 'range' && !running ? 'invalid' : undefined}
                      {...minSwipeHandlers}
                      disabled={running} />
                    <span>to</span>
                    <input type="text" readOnly value={letterMode ? numToLetter(maxEx) : String(maxEx)}
                      className={!validRange && exMode === 'range' && !running ? 'invalid' : undefined}
                      {...maxSwipeHandlers}
                      disabled={running} />
                  </div>
                ) : (
                  <button
                    className={`pick-trigger-btn${pickedNums.length === 0 ? ' empty' : ''}${pickedNums.length === 0 && !running ? ' invalid' : ''}`}
                    disabled={running}
                    onClick={() => setPickerOpen(true)}>
                    {pickedNums.length === 0 ? 'Tap to select...' : pickedNums.map(n => letterMode ? numToLetter(n) : String(n)).join(', ')}
                  </button>
                )}
                <div className="ex-mode-toggle">
                  <button className={`ex-mode-btn${exMode === 'range' ? ' active' : ''}`}
                    disabled={running}
                    onClick={() => setExMode('range')}>Range</button>
                  <button className={`ex-mode-btn${exMode === 'pick' ? ' active' : ''}`}
                    disabled={running}
                    onClick={() => { setExMode('pick'); setExerciseLength(1); }}>Pick</button>
                </div>
              </div>
            </div>
          )}

          {mode !== MODE_CLICKONLY && (
            <div className={`control-group ex-length-group${running || exMode === 'pick' ? " dimmed" : ""}`}>
              <label>Exercise length</label>
              <CompactSelector
                id="exLength"
                value={exerciseLength}
                options={[1, 2, 4]}
                onChange={setExerciseLength}
                disabled={running || exMode === 'pick'}
                openSelector={openSelector}
                setOpenSelector={setOpenSelector}
                getLabel={n => n === 1 ? "1 bar" : `${n} bars`}
              />
            </div>
          )}

          {/* Row: Rounds + Sets (Shuffle/Sequence) */}
          {mode !== MODE_CLICKONLY && (
            <div className={`control-group${running ? " dimmed" : ""}`}>
              <label>Rounds Per Exercise</label>
              <div className="stepper">
                <button className="stepper-btn left" disabled={running} {...barsDecHandlers}>−</button>
                <div className="stepper-val" style={running ? { opacity: 0.25 } : {}}>{barsPerExercise}</div>
                <button className="stepper-btn right" disabled={running} {...barsIncHandlers}>+</button>
              </div>
            </div>
          )}

          {mode !== MODE_CLICKONLY && (
            <div className={`control-group sets-group${running ? " dimmed" : ""}`}>
              <label>Sets</label>
              <div className="sets-stepper">
                <button className="stepper-btn left" disabled={running || sets === 1}
                  onClick={() => setSets(s => s === '∞' ? 99 : Math.max(1, s - 1))}>−</button>
                <div className="stepper-val sets-val" style={running ? { opacity: 0.25 } : {}}>
                  {sets === '∞' ? '∞' : `×${sets}`}
                </div>
                <button className="stepper-btn right" disabled={running || sets === '∞'}
                  onClick={() => setSets(s => s === '∞' ? '∞' : s + 1)}>+</button>
                <button
                  className={`sets-inf-btn${sets === '∞' ? " active" : ""}`}
                  disabled={running}
                  onClick={() => setSets(s => s === '∞' ? 1 : '∞')}>∞</button>
              </div>
            </div>
          )}

          {/* Display toggle — Metronome only */}
          {mode === MODE_CLICKONLY && (
            <div className={`control-group display-toggle-group${running ? " dimmed" : ""}`}>
              <label>Display</label>
              <div className="selector-row">
                <button className={`sel-btn${displayMode === 'bars' ? " active" : ""}`}
                  disabled={running}
                  onClick={() => setDisplayMode('bars')}>Bars</button>
                <button className={`sel-btn${displayMode === 'timer' ? " active" : ""}`}
                  disabled={running}
                  onClick={() => setDisplayMode('timer')}>Timer</button>
              </div>
            </div>
          )}

        </div>

      </div>

      <div className="btn-row">
        {!running ? (
          <>
            <button className="action-btn" onClick={handleStart} disabled={!validRange}>
              Start
            </button>
            <div className="vol-wrap">
              <button ref={volBtnRef} className={`vol-label-btn${showVolume ? " active" : ""}`} onClick={() => setShowVolume(v => !v)}>
                {volIcon}&nbsp;vol
              </button>
            </div>
          </>
        ) : (
          <>
            {mode === MODE_CLICKONLY ? (
              <button className="action-btn stop" onClick={handleStop}>
                Stop
              </button>
            ) : (
              <>
                <div className="btn-group">
                  <button className={`action-btn${paused ? " pause-active" : " secondary"}`} onClick={handlePause}>
                    {paused ? "Resume" : "Pause"}
                  </button>
                  <button className={`action-btn${looping ? " loop-active" : " secondary"}`} onClick={handleLoop}>
                    Loop
                  </button>
                </div>
                <div className="btn-group-stop">
                  <button className="action-btn stop" onClick={handleStop}>
                    Stop
                  </button>
                </div>
              </>
            )}
            <div className="vol-wrap">
              <button ref={volBtnRef} className={`vol-label-btn${showVolume ? " active" : ""}`} onClick={() => setShowVolume(v => !v)}>
                {volIcon}&nbsp;vol
              </button>
            </div>
          </>
        )}
      </div>

      {showVolume && ReactDOM.createPortal(
        <>
          <div className="compact-popup-backdrop" onClick={() => setShowVolume(false)} />
          <VolPopup
            volBtnRef={volBtnRef}
            volume={volume} setVolume={setVolume}
            subdivVol={subdivVol} setSubdivVol={setSubdivVol}
            subdivVol2={subdivVol2} setSubdivVol2={setSubdivVol2}
            subdivision={subdivision}
          />
        </>,
        document.body
      )}

      <div className="version-footer">v1.9.15.beta.3 · rossfarley.uk · © 2026 Ross Farley</div>

      {numpadOpen === 'min' && (
        <NumpadPopup
          label="MIN"
          initialValue={minEx}
          onConfirm={(v) => { setMinEx(v); setNumpadOpen(null); }}
          onClose={() => setNumpadOpen(null)}
          letterMode={letterMode}
        />
      )}
      {numpadOpen === 'max' && (
        <NumpadPopup
          label="MAX"
          initialValue={maxEx}
          onConfirm={(v) => { setMaxEx(v); setNumpadOpen(null); }}
          onClose={() => setNumpadOpen(null)}
          letterMode={letterMode}
        />
      )}
      {pickerOpen && (
        <BarPickerPopup
          pickedNums={pickedNums}
          onConfirm={(nums) => { setPickedNums(nums); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
          letterMode={letterMode}
        />
      )}

      {bpmAutoOpen && (mode === MODE_CLICKONLY || sets === '∞') && ReactDOM.createPortal(
        <BpmAutoPopup
          mode={mode} bpm={bpm}
          bpmAuto={bpmAuto} setBpmAuto={setBpmAuto}
          bpmAutoStep={bpmAutoStep} setBpmAutoStep={setBpmAutoStep}
          bpmAutoDir={bpmAutoDir} setBpmAutoDir={setBpmAutoDir}
          bpmAutoTrigger={bpmAutoTrigger} setBpmAutoTrigger={setBpmAutoTrigger}
          bpmAutoBarInterval={bpmAutoBarInterval} setBpmAutoBarInterval={setBpmAutoBarInterval}
          bpmAutoSecInterval={bpmAutoSecInterval} setBpmAutoSecInterval={setBpmAutoSecInterval}
          bpmAutoRandom={bpmAutoRandom} setBpmAutoRandom={setBpmAutoRandom}
          bpmAutoMin={bpmAutoMin} setBpmAutoMin={setBpmAutoMin}
          bpmAutoMax={bpmAutoMax} setBpmAutoMax={setBpmAutoMax}
          anchorRef={bpmGearBtnRef}
          onClose={() => setBpmAutoOpen(false)}
        />,
        document.body
      )}

      {showLetterModePopup && ReactDOM.createPortal(
        <>
          <div className="numpad-backdrop" onClick={() => setShowLetterModePopup(false)} />
          <div className="letter-mode-popup">
            <div className="letter-mode-popup-title">You've discovered letter mode!</div>
            <div className="letter-mode-popup-body">Exercises will now show as letters A–Z. To switch back to number mode, press and hold the version number at the bottom of the screen.</div>
            <button className="letter-mode-popup-ok" onPointerDown={(e) => e.preventDefault()} onClick={() => setShowLetterModePopup(false)}>Got it</button>
          </div>
        </>,
        document.body
      )}

    </div>
  );
}
