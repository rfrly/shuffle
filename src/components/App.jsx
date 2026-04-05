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
  const [infinite,        setInfinite]        = useState(() => saved?.infinite ?? false);
  const [stopwatch,       setStopwatch]       = useState(() => saved?.stopwatch ?? false);
  const [infiniteByMode,  setInfiniteByMode]  = useState(() => saved?.infiniteByMode ?? { [MODE_FULLSET]: false, [MODE_SEQUENTIAL]: false });
  const [stopwatchPref,   setStopwatchPref]   = useState(() => saved?.stopwatchPref ?? false);
  const [elapsedSeconds,  setElapsedSeconds]  = useState(0);
  const timerStartRef  = useRef(null);
  const elapsedAccumRef = useRef(0);
  const [volume,          setVolume]          = useState(() => saved?.volume ?? 1.0);
  const [exercise,        setExercise]        = useState(null);
  const [nextEx,          setNextEx]          = useState(null);
  const [tapped,          setTapped]          = useState(false);
  const [showVolume,      setShowVolume]      = useState(false);
  const [showHelp,        setShowHelp]        = useState(false);
  const [openSelector,    setOpenSelector]    = useState(null);
  const [helpScrolledToEnd, setHelpScrolledToEnd] = useState(false);
  const [helpNeedsScroll, setHelpNeedsScroll] = useState(false);
  const helpOverlayRef = useRef(null);
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
                   minEx, maxEx, countInBars, countInEvery, mode, infinite, volume,
                   exMode, pickedNums, letterMode, stopwatch, infiniteByMode, stopwatchPref,
                   subdivision, beatStates });
  }, [bpm, timeSig, barsPerExercise, exerciseLength, minEx, maxEx, countInBars, countInEvery, mode, infinite, volume, exMode, pickedNums, letterMode, stopwatch, infiniteByMode, stopwatchPref, subdivision, beatStates]);

  useEffect(() => {
    if (window.location.search) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    setBeatStates(defaultBeatStates(timeSig.label));
  }, [timeSig]);

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
  const handleSetComplete  = useCallback(() => {
    setRunning(false); setPaused(false); setLooping(false); setResuming(false);
    setExercise(null); setNextEx(null);
    setSetComplete(true);
    setTimeout(() => setSetComplete(false), SET_COMPLETE_DISPLAY_MS);
  }, []);

  const { currentBeat, currentBar, currentSubdiv, phase, flashOn, countInBeat, isResuming } = useDrumTimer({
    bpm,
    beatsPerBar: timeSig.beats,
    barsPerExercise: barsPerExercise * (exMode === 'pick' ? 1 : exerciseLength),
    minEx, maxEx,
    onNewExercise: handleNewExercise,
    onNextExercise: handleNextExercise,
    onSetComplete: handleSetComplete,
    running, paused, resuming,
    countInBars,
    countInEveryRound: countInEvery,
    mode, volume, looping, infinite, setComplete,
    exMode, pickedNums, subdivision, beatStates,
  });

  useEffect(() => {
    if (!showMuteHint || phase !== "playing") return;
    const t = setTimeout(() => setShowMuteHint(false), 400);
    return () => clearTimeout(t);
  }, [phase, showMuteHint]);

  const handleStart = () => {
    if (!localStorage.getItem('muteHintSeen')) {
      localStorage.setItem('muteHintSeen', '1');
      setShowMuteHint(true);
    }
    setSetComplete(false);
    setExercise(null); setNextEx(null);
    setPaused(false); setLooping(false); setResuming(false); setRunning(true);
  };

  const handleStop = () => {
    setRunning(false); setPaused(false); setLooping(false); setResuming(false);
    setExercise(null); setNextEx(null); setSetComplete(false);
    timerStartRef.current = null; elapsedAccumRef.current = 0; setElapsedSeconds(0);
  };

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
    if (mode !== MODE_CLICKONLY || !stopwatch) {
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
  }, [phase, paused, mode, stopwatch]);

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

  const modeSummary = (mode === MODE_FULLSET ? "shuffle" : mode === MODE_SEQUENTIAL ? "sequence" : "metronome") + (infinite && mode !== MODE_CLICKONLY ? " ∞" : "");


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
                    if (infinite && mode !== MODE_CLICKONLY) p.set("inf", "1");
                    if (stopwatch && mode === MODE_CLICKONLY) p.set("sw", "1");
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
                    setInfinite(false);
                    setStopwatch(false);
                    setInfiniteByMode({ [MODE_FULLSET]: false, [MODE_SEQUENTIAL]: false });
                    setStopwatchPref(false);
                    setVolume(1.0);
                    setExMode('range');
                    setPickedNums([]);
                    setLetterMode(false);
                    setSubdivision(1);
                    setBeatStates(defaultBeatStates('4/4'));
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
              <p>Shuffle randomises your exercises to help you practise more effectively.</p>
            </div>
            <div className="help-section">
              <h3>Set up</h3>
              <p>Choose your mode, then configure your session: exercise range (swipe up/down to nudge) or pick specific exercises, BPM, time signature, exercise length (always 1 bar in pick mode), and rounds.</p>
              <p>Tap Count in to set the count-in length. Enable "count in every exercise" if you want a count-in before each exercise, not just the first.</p>
            </div>
            <div className="help-section">
              <h3>Modes</h3>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', listStyleType: 'disc' }}>
                <li>Shuffle — plays every exercise in random order, then stops. Tap Shuffle again to turn on ∞ mode — it loops continuously.</li>
                <li>Sequence — plays exercises in order, then stops. Tap Sequence again to turn on ∞ mode — it loops continuously.</li>
                <li>Metronome — bar counter, runs until you stop it. Tap Metronome again to switch to stopwatch mode — shows elapsed time instead of bars.</li>
              </ul>
            </div>
            <div className="help-section">
              <h3>Loop / Pause / Stop</h3>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', listStyleType: 'disc' }}>
                <li>Loop — repeats the current exercise indefinitely. Tap again to turn off loop mode; it will exit at the end of the current round.</li>
                <li>Pause — stops the metronome. Resuming restarts the current exercise from the beginning with a count-in.</li>
                <li>Stop — ends the session and resets everything.</li>
              </ul>
            </div>
            <div className="help-section">
              <h3>Tips</h3>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', listStyleType: 'disc' }}>
                <li>If you can't hear anything, check your device isn't in silent mode.</li>
                <li>Keep the app on screen while practising — audio may stop if you switch away or lock your device.</li>
                <li>For the best experience on iPhone, use Safari or add Shuffle to your home screen.</li>
                <li>Tap <strong>☰</strong> to switch to letter mode, share your settings as a link, or reset all settings to defaults.</li>
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

      <div className="display">
        <div className="exercise-label">
          {phase === "countin" ? "count in" : phase === "idle" ? (setComplete ? "\u00A0" : "ready") : mode === MODE_CLICKONLY ? (stopwatch ? "time" : "bar") : "exercise"}
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
            {mode === MODE_CLICKONLY && stopwatch && phase !== "idle"
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
                    if (m.value === mode && m.value === MODE_CLICKONLY) {
                      setStopwatch(v => { setStopwatchPref(!v); return !v; });
                    } else if (m.value === mode && (m.value === MODE_FULLSET || m.value === MODE_SEQUENTIAL)) {
                      setInfinite(v => { setInfiniteByMode(prev => ({ ...prev, [mode]: !v })); return !v; });
                    } else {
                      if (mode === MODE_FULLSET || mode === MODE_SEQUENTIAL) {
                        setInfiniteByMode(prev => ({ ...prev, [mode]: infinite }));
                      }
                      if (mode === MODE_CLICKONLY) {
                        setStopwatchPref(stopwatch);
                      }
                      setMode(m.value);
                      setInfinite(m.value === MODE_FULLSET || m.value === MODE_SEQUENTIAL ? infiniteByMode[m.value] : false);
                      setStopwatch(m.value === MODE_CLICKONLY ? stopwatchPref : false);
                    }
                  }} disabled={running}
                  >
                  {m.label}{(m.value === mode ? infinite : infiniteByMode[m.value]) && (m.value === MODE_FULLSET || m.value === MODE_SEQUENTIAL) ? " ∞" : ""}{(m.value === mode ? stopwatch : (m.value === MODE_CLICKONLY ? stopwatchPref : false)) && m.value === MODE_CLICKONLY ? " \u23F1\uFE0E" : ""}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>BPM</label>
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
          </div>

          <div className={`control-group${running ? " dimmed" : ""}`}>
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

          {mode !== MODE_CLICKONLY && (
            <div className={`control-group${running || exMode === 'pick' ? " dimmed" : ""}`}>
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

          {mode !== MODE_CLICKONLY && (
            <div className={`control-group${running ? " dimmed" : ""}`}>
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
            <div className={`control-group${running ? " dimmed" : ""}`}>
              <label>Rounds</label>
              <div className="stepper">
                <button className="stepper-btn left" disabled={running} {...barsDecHandlers}>−</button>
                <div className="stepper-val" style={running ? { opacity: 0.25 } : {}}>{barsPerExercise}</div>
                <button className="stepper-btn right" disabled={running} {...barsIncHandlers}>+</button>
              </div>
            </div>
          )}

          {mode === MODE_CLICKONLY && (
            <div className={`control-group full-width${running ? " dimmed" : ""}`}>
              <label>Subdivision</label>
              <div className="selector-row">
                {[{v:1,l:"None"},{v:2,l:"8ths"},{v:3,l:"Triplets"},{v:4,l:"16ths"}].map(opt => (
                  <button key={opt.v}
                    className={`sel-btn${subdivision === opt.v ? " active" : ""}`}
                    disabled={running}
                    onClick={() => setSubdivision(opt.v)}>
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>

      {showMuteHint && phase !== "idle" && (
        <div className={`mute-hint${phase !== "countin" ? " fading" : ""}`}>No sound? Check volume and silent mode.</div>
      )}
      {appToastMsg && <div key={appToastKey} className="app-toast">{appToastMsg}</div>}

      <div className="btn-row">
        {!running ? (
          <>
            <button className="action-btn" onClick={handleStart} disabled={!validRange}>
              Start
            </button>
            <div className="vol-wrap">
              <button className={`vol-label-btn${showVolume ? " active" : ""}`} onClick={() => setShowVolume(v => !v)}>
                {volIcon}&nbsp;vol
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="btn-group">
              <button className={`action-btn${paused ? " pause-active" : " secondary"}`} onClick={handlePause}>
                {paused ? "Resume" : "Pause"}
              </button>
              {mode !== MODE_CLICKONLY && (
                <button className={`action-btn${looping ? " loop-active" : " secondary"}`} onClick={handleLoop}>
                  Loop
                </button>
              )}
            </div>
            <div className="btn-group-stop">
              <button className="action-btn stop" onClick={handleStop}>
                Stop
              </button>
            </div>
            <div className="vol-wrap">
              <button className={`vol-label-btn${showVolume ? " active" : ""}`} onClick={() => setShowVolume(v => !v)}>
                {volIcon}&nbsp;vol
              </button>
            </div>
          </>
        )}
        {showVolume && (
          <div className="vol-slider-row">
            <span>Volume</span>
            <input type="range" min={0} max={1} step={0.05}
              value={volume} onChange={e => setVolume(Number(e.target.value))} />
          </div>
        )}
      </div>

      <div className="version-footer">v1.9.8.beta.6 · rossfarley.uk · © 2026 Ross Farley</div>

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
