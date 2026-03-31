#!/usr/bin/env python3
"""
build-watch.sh — Rebuilds watch/index.html from the current test/index.html.

Run this after making changes to test/index.html to keep the watch app in sync:
  python3 build-watch.sh

The watch app is the full Shuffle app with a Firebase-powered session sharing
layer added on top. It lives at shuffleclick.com/watch/ and is a private
teacher/student observation tool — not part of the public app.

The script injects:
  1. Firebase SDK script tags (after Babel)
  2. Watch-specific CSS (before </style>)
  3. Firebase init + ObserverDisplay component (after React destructuring)
  4. Watch mode state variables (into App)
  5. Watch effects and handlers (into App, after useDrumTimer)
  6. Watch UI overlays (wrapping the JSX return)
"""

import re, sys, os

WATCH_VERSION = "1.0"

SRC  = os.path.join(os.path.dirname(__file__), "test", "index.html")
DEST = os.path.join(os.path.dirname(__file__), "watch", "index.html")

with open(SRC, "r") as f:
    src = f.read()

# ── 1. Head patches ──────────────────────────────────────────────────────────

src = src.replace("<title>Shuffle</title>", "<title>Shuffle Watch</title>")
src = src.replace(
    '<meta name="apple-mobile-web-app-title" content="Shuffle" />',
    '<meta name="apple-mobile-web-app-title" content="Shuffle Watch" />'
)
src = src.replace(
    '<meta property="og:title" content="Shuffle" />',
    '<meta property="og:title" content="Shuffle Watch" />'
)
src = src.replace(
    '  <link rel="apple-touch-icon" href="https://shuffleclick.com/test/shuffle-icon-beta.png?v=9" />\n'
    '  <link rel="apple-touch-icon" sizes="512x512" href="https://shuffleclick.com/test/shuffle-icon-beta.png?v=9" />\n'
    '  <link rel="icon" href="https://shuffleclick.com/test/shuffle-icon-beta.png?v=9" />',
    '  <link rel="apple-touch-icon" href="https://shuffleclick.com/watch/shuffle-icon-watch.png" />\n'
    '  <link rel="apple-touch-icon" sizes="512x512" href="https://shuffleclick.com/watch/shuffle-icon-watch.png" />\n'
    '  <link rel="icon" href="https://shuffleclick.com/watch/shuffle-icon-watch.png" />'
)

# ── 2. Firebase SDK scripts ──────────────────────────────────────────────────

firebase_scripts = (
    '  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>\n'
    '  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>'
)
src = src.replace(
    '  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>',
    '  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>\n' + firebase_scripts
)

# ── 3. Watch-specific CSS ────────────────────────────────────────────────────

watch_css = r"""
    /* ── Watch mode overlay ──────────────────────────────────────────────────── */
    .watch-overlay {
      position: fixed; inset: 0; background: #0f0f0f; z-index: 200;
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 1.25rem;
      padding: max(2rem, env(safe-area-inset-top)) 2rem max(2rem, env(safe-area-inset-bottom));
    }
    .watch-overlay-title {
      font-family: var(--font-mono); font-size: 1.1rem; letter-spacing: 0.2em;
      text-transform: uppercase; color: #f5c842; text-align: center;
    }
    .watch-overlay-subtitle {
      font-family: var(--font-mono); font-size: 0.55rem; letter-spacing: 0.1em;
      text-transform: uppercase; color: #888; text-align: center; margin-top: -0.75rem;
    }
    .watch-btn {
      width: 100%; max-width: 380px; height: 56px; border-radius: 4px; border: none;
      font-family: var(--font-mono); font-size: 0.85rem; letter-spacing: 0.15em;
      text-transform: uppercase; cursor: pointer; transition: opacity 0.1s;
    }
    .watch-btn:active { opacity: 0.7; }
    .watch-btn.primary { background: #f5c842; color: #0f0f0f; }
    .watch-btn.secondary { background: #1a1a1a; color: #ccc; border: 1px solid #333; }
    .watch-code-input {
      width: 100%; max-width: 380px; height: 56px;
      background: #1a1a1a; border: 1px solid #444; border-radius: 4px;
      color: #f5c842; font-family: var(--font-mono); font-size: 1.3rem;
      letter-spacing: 0.1em; text-align: center; text-transform: uppercase;
      outline: none; caret-color: #f5c842;
    }
    .watch-code-input::placeholder { color: #333; letter-spacing: 0.05em; }
    .watch-code-input:focus { border-color: #f5c842; }
    .watch-connect-btn {
      width: 100%; max-width: 380px; height: 56px; border-radius: 4px; border: none;
      background: #f5c842; color: #0f0f0f; font-family: var(--font-mono);
      font-size: 0.85rem; letter-spacing: 0.15em; text-transform: uppercase; cursor: pointer;
    }
    .watch-connect-btn:active { opacity: 0.7; }
    .watch-connect-btn:disabled { opacity: 0.3; cursor: default; }
    .watch-entry-error {
      font-family: var(--font-mono); font-size: 0.65rem; letter-spacing: 0.1em;
      color: #ff4500; text-align: center; max-width: 380px;
    }
    .watch-back-btn {
      background: none; border: none; color: #555; font-family: var(--font-mono);
      font-size: 0.65rem; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; padding: 0.5rem;
    }
    .watch-back-btn:active { color: #aaa; }
    .share-session-code {
      font-family: var(--font-mono); font-size: clamp(2rem, 8vw, 3rem);
      letter-spacing: 0.25em; color: #f5c842; text-shadow: 0 0 30px rgba(245,200,66,0.3);
      text-align: center;
    }
    .share-session-label {
      font-family: var(--font-mono); font-size: 0.6rem; letter-spacing: 0.25em;
      text-transform: uppercase; color: #888; text-align: center;
    }
    .share-session-hint {
      font-family: var(--font-mono); font-size: 0.65rem; letter-spacing: 0.08em;
      color: #555; text-align: center; line-height: 1.7; max-width: 320px;
    }
    .sharing-indicator {
      width: 28px; display: flex; align-items: center; justify-content: center;
      cursor: pointer; flex-shrink: 0; background: none; border: none; padding: 0;
    }
    .sharing-indicator-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #f5c842;
      animation: sharing-pulse 2s ease-in-out infinite;
    }
    @keyframes sharing-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    /* Student controls: dimmed but readable while sharing */
    .control-group.watch-locked { opacity: 0.6; pointer-events: none; cursor: default; }
    /* Observer display */
    .observer-app { user-select: none; }
    .observer-app {
      position: fixed; inset: 0; background: #0f0f0f; display: flex;
      flex-direction: column; align-items: center; justify-content: flex-start;
      padding-left: 1.5rem; padding-right: 1.5rem;
      padding-top: max(1rem, env(safe-area-inset-top));
      padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
      gap: 0.75rem; overflow-y: auto;
    }
    .watching-banner {
      display: flex; align-items: center; justify-content: space-between;
      width: 100%; max-width: 440px; flex-shrink: 0;
      padding: 0.5rem 0.75rem; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 4px;
    }
    .watching-code-text {
      font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.15em; color: #888;
    }
    .watching-code-text span { color: #f5c842; }
    .watching-disconnect-btn {
      background: none; border: 1px solid #333; border-radius: 4px; color: #888;
      font-family: var(--font-mono); font-size: 0.6rem; letter-spacing: 0.1em;
      text-transform: uppercase; padding: 0.3rem 0.6rem; cursor: pointer;
    }
    .watching-disconnect-btn:active { color: #ccc; border-color: #555; }
    .observer-info-strip {
      display: flex; gap: 1.5rem; align-items: center; justify-content: center;
      width: 100%; max-width: 440px;
    }
    .observer-info-item { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; }
    .observer-info-label {
      font-family: var(--font-mono); font-size: 0.55rem; letter-spacing: 0.15em;
      text-transform: uppercase; color: #555;
    }
    .observer-info-value { font-family: var(--font-mono); font-size: 0.9rem; letter-spacing: 0.05em; color: #aaa; }
    .observer-offline {
      font-family: var(--font-mono); font-size: 0.65rem; letter-spacing: 0.1em;
      color: #ff4500; text-align: center;
    }
    @media (hover: none) and (pointer: coarse) and (min-width: 768px) and (min-height: 700px) {
      .watching-banner { max-width: 700px; }
      .observer-info-strip { max-width: 700px; }
      .observer-app .display { max-width: 700px; }
    }
    /* Observer display layout */
    .observer-app .display { min-height: clamp(178px, 30dvh, 320px); }
    .observer-app .bpm-tap { user-select: none; }
    .observer-app .btn-row { width: 100%; max-width: 440px; }
    /* Observer controls panel */
    .observer-controls {
      width: 100%; max-width: 440px;
    }
    .observer-divider {
      width: 100%; max-width: 440px;
      border: none; border-top: 1px solid #1e1e1e; margin: 0.25rem 0; flex-shrink: 0;
    }
    @media (hover: none) and (pointer: coarse) and (min-width: 768px) and (min-height: 700px) {
      .observer-controls { max-width: 700px; }
      .observer-divider  { max-width: 700px; }
    }
"""
src = src.replace("  </style>", watch_css + "  </style>")

# ── 3b. Student controls: lock when watchScreen === "app" ────────────────────
# The watch layer injects watchScreen into App scope. We patch the student
# controls to add watch-locked class (opacity 0.6, pointer-events none) without
# adding disabled attributes — disabled causes its own opacity: 0.25 override.

# handleTap guard
src = src.replace(
    "      const handleTap = useCallback(() => {\n        if (running) return;",
    "      const handleTap = useCallback(() => {\n        if (running || watchScreen === \"app\") return;"
)

# incBpm / decBpm / incBars / decBars guards
src = src.replace(
    "      const clampBpm = (v) => Math.min(BPM_MAX, Math.max(BPM_MIN, v));\n"
    "      const incBpm  = useCallback(() => setBpm(b => clampBpm(b + 1)), []);\n"
    "      const decBpm  = useCallback(() => setBpm(b => clampBpm(b - 1)), []);\n"
    "      const incBars   = useCallback(() => { if (!running) setBarsPerExercise(b => Math.min(BARS_MAX, b + 1)); }, [running]);\n"
    "      const decBars   = useCallback(() => { if (!running) setBarsPerExercise(b => Math.max(BARS_MIN, b - 1)); }, [running]);",
    "      const clampBpm = (v) => Math.min(BPM_MAX, Math.max(BPM_MIN, v));\n"
    "      const incBpm  = useCallback(() => { if (watchScreen === \"app\") return; setBpm(b => clampBpm(b + 1)); }, [watchScreen]);\n"
    "      const decBpm  = useCallback(() => { if (watchScreen === \"app\") return; setBpm(b => clampBpm(b - 1)); }, [watchScreen]);\n"
    "      const incBars   = useCallback(() => { if (!running && watchScreen !== \"app\") setBarsPerExercise(b => Math.min(BARS_MAX, b + 1)); }, [running, watchScreen]);\n"
    "      const decBars   = useCallback(() => { if (!running && watchScreen !== \"app\") setBarsPerExercise(b => Math.max(BARS_MIN, b - 1)); }, [running, watchScreen]);"
)

# Mode control group
src = src.replace(
    '              <div className={`control-group full-width${running ? " dimmed" : ""}`}>',
    '              <div className={`control-group full-width${watchScreen === "app" ? " watch-locked" : running ? " dimmed" : ""}`}>'
)

# Mode buttons: no disabled for watchScreen (pointer-events: none on parent handles it)
# (leave disabled={running} as-is; the watch-locked class already blocks interaction)

# BPM control group
src = src.replace(
    '              <div className="control-group">\n                <label>BPM</label>\n                <div className="bpm-widget">\n'
    '                  <button className="bpm-btn left" {...bpmDecHandlers}>−</button>\n'
    '                  <div className={`bpm-tap${tapped ? " tapped" : ""}`}\n'
    '                    onClick={!running ? handleTap : undefined}\n'
    '                    style={running ? { cursor: "default", pointerEvents: "none" } : {}}>\n'
    '                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>\n'
    '                      <span>{bpm}</span>\n'
    '                      {!running && <span className="bpm-tap-label">tap to set</span>}\n'
    '                    </div>\n'
    '                  </div>\n'
    '                  <button className="bpm-btn right" {...bpmIncHandlers}>+</button>',
    '              <div className={`control-group${watchScreen === "app" ? " watch-locked" : ""}`}>\n                <label>BPM</label>\n                <div className="bpm-widget">\n'
    '                  <button className="bpm-btn left" {...bpmDecHandlers}>−</button>\n'
    '                  <div className={`bpm-tap${tapped ? " tapped" : ""}`}\n'
    '                    onClick={!running && watchScreen !== "app" ? handleTap : undefined}\n'
    '                    style={running || watchScreen === "app" ? { cursor: "default", pointerEvents: "none" } : {}}>\n'
    '                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>\n'
    '                      <span>{bpm}</span>\n'
    '                      {!running && watchScreen !== "app" && <span className="bpm-tap-label">tap to set</span>}\n'
    '                    </div>\n'
    '                  </div>\n'
    '                  <button className="bpm-btn right" {...bpmIncHandlers}>+</button>'
)

# Time signature control group
src = src.replace(
    '              <div className={`control-group${running ? " dimmed" : ""}`}>\n                <label>Time signature</label>',
    '              <div className={`control-group${watchScreen === "app" ? " watch-locked" : running ? " dimmed" : ""}`}>\n                <label>Time signature</label>'
)

# Count in control group
src = src.replace(
    '              <div className={`control-group${running ? " dimmed" : ""}`}>\n                <label>Count in</label>',
    '              <div className={`control-group${watchScreen === "app" ? " watch-locked" : running ? " dimmed" : ""}`}>\n                <label>Count in</label>'
)

# Exercise length control group
src = src.replace(
    '              <div className={`control-group${mode === MODE_CLICKONLY || running || exMode === \'pick\' ? " dimmed" : ""}`}>',
    '              <div className={`control-group${watchScreen === "app" ? " watch-locked" : mode === MODE_CLICKONLY || running || exMode === \'pick\' ? " dimmed" : ""}`}>'
)

# Exercises control group
src = src.replace(
    '              <div className={`control-group${running || mode === MODE_CLICKONLY ? " dimmed" : ""}`}>\n                    <label>Exercises</label>',
    '              <div className={`control-group${watchScreen === "app" ? " watch-locked" : running || mode === MODE_CLICKONLY ? " dimmed" : ""}`}>\n                    <label>Exercises</label>'
)

# Rounds control group
src = src.replace(
    '              <div className={`control-group${mode === MODE_CLICKONLY || running ? " dimmed" : ""}`}>\n                <label>Rounds</label>',
    '              <div className={`control-group${watchScreen === "app" ? " watch-locked" : mode === MODE_CLICKONLY || running ? " dimmed" : ""}`}>\n                <label>Rounds</label>'
)

# Idle summary: no leading zeros (use plain numbers, not fmt())
src = src.replace(
    "      : `${fmtEx(minEx, letterMode)}–${fmtEx(maxEx, letterMode)} · ${exerciseLength}-bar ex · ${barsPerExercise} round${barsPerExercise !== 1 ? \"s\" : \"\"} · ${modeSummary}`}",
    "      : `${letterMode ? numToLetter(minEx) : String(minEx)}–${letterMode ? numToLetter(maxEx) : String(maxEx)} · ${exerciseLength}-bar ex · ${barsPerExercise} round${barsPerExercise !== 1 ? \"s\" : \"\"} · ${modeSummary}`}"
)
src = src.replace(
    "      ? `${pickedNums.length === 0 ? 'no bars' : pickedNums.length > 4 ? `${pickedNums.length} exercises` : pickedNums.map(n => fmtEx(n, letterMode)).join(', ')} · ${barsPerExercise} round${barsPerExercise !== 1 ? \"s\" : \"\"} · ${modeSummary}`",
    "      ? `${pickedNums.length === 0 ? 'no bars' : pickedNums.length > 4 ? `${pickedNums.length} exercises` : pickedNums.map(n => letterMode ? numToLetter(n) : String(n)).join(', ')} · ${barsPerExercise} round${barsPerExercise !== 1 ? \"s\" : \"\"} · ${modeSummary}`"
)

# Letter mode popup: suppress when sharing
src = src.replace(
    '        setShowLetterModePopup(true);',
    '        if (watchScreen !== "app") setShowLetterModePopup(true);'
)

# Mute hint: suppress when sharing
src = src.replace(
    '            {showMuteHint && phase !== "idle" && (\n'
    '              <div className={`mute-hint${phase !== "countin" ? " fading" : ""}`}>No sound? Check volume and silent mode.</div>\n'
    '            )}',
    '            {showMuteHint && phase !== "idle" && watchScreen !== "app" && (\n'
    '              <div className={`mute-hint${phase !== "countin" ? " fading" : ""}`}>No sound? Check volume and silent mode.</div>\n'
    '            )}'
)

# ── 4. Firebase init + ObserverDisplay component ─────────────────────────────

firebase_and_observer = r"""
    // ── Firebase (watch feature) ───────────────────────────────────────────────
    let _db;
    try {
      const _app = firebase.initializeApp({
        apiKey: "AIzaSyD8efbcrvPm3rBt0NGU3RFhhTRyUTFrB_s",
        authDomain: "shuffle-watch-d578b.firebaseapp.com",
        projectId: "shuffle-watch-d578b",
        storageBucket: "shuffle-watch-d578b.firebasestorage.app",
        messagingSenderId: "173594856788",
        appId: "1:173594856788:web:c96078f9d9df5d41e24cc1",
        databaseURL: "https://shuffle-watch-d578b-default-rtdb.europe-west1.firebasedatabase.app",
      });
      _db = firebase.database(_app);
    } catch(e) { _db = firebase.database(); }

    const WATCH_WORDS = [
      "ARCH","BALE","BARK","BELL","BIRD","BLADE","BLOOM","BOAT","BOG","BOLT",
      "BONE","BOOK","BOOT","BOWL","BOW","BRICK","BRIDGE","BRUSH","BUD","BURR",
      "CAKE","CAMP","CARD","CART","CASK","CAVE","CHIN","CHIP","CLAW","CLAY",
      "CLIFF","CLIP","CLOCK","CLOUD","CLUB","COAL","COAT","COIN","CORK","CORN",
      "CRAB","CREST","CROP","CROWN","DELL","DRUM","DUCK","DUNE","DUSK","DUST",
      "FERN","FISH","FLAX","FLAG","FLAME","FLASK","FLINT","FLOCK","FLOOR","FOAM",
      "FOLD","FONT","FORD","FORK","FROG","FROST","GATE","GIFT","GLEN","GLOVE",
      "GLOW","GOLD","GORGE","GRAIN","GRAPE","GRASS","GRID","GROVE","GUST","HAND",
      "HARP","HAWK","HELM","HILL","HIVE","HOOD","HOOK","HORN","HULL","HUSK",
      "IRON","JADE","KITE","KNOT","LAMP","LARK","LEAF","LEDGE","LIME","LINK",
      "LION","LOCK","LOFT","LOOM","LUTE","MARSH","MAST","MILL","MINT","MIST",
      "MOAT","MOON","MOOR","MOSS","MOTH","MOUNT","NAIL","NEST","NOTE","OAK",
      "OAR","ORB","PAIL","PALM","PATH","PEAK","PERCH","PINE","PIPE","PLANK",
      "PLUM","POND","POOL","PORT","QUILL","REED","REEF","RIDGE","RING","RIND",
      "ROAD","ROCK","ROOF","ROOT","ROPE","ROSE","RUNE","RUST","SAGE","SAIL",
      "SALT","SAND","SEED","SHARD","SHELL","SHIP","SILK","SILT","SLATE","SLOPE",
      "SNOW","SOIL","SPAN","SPARK","SPIRE","SPRIG","STAFF","STAG","STAR","STEM",
      "STEP","STIR","STONE","STORM","STREAM","STUMP","SURF","SWAN","THORN","TIDE",
      "TILE","TOAD","TORCH","TOWER","TRAIL","TREE","TURF","TWIG","VALE","VAULT",
      "VINE","WAVE","WELD","WELL","WHEAT","WICK","WIND","WING","WISP","WIRE",
      "WOLF","WOOD","WOOL","WREN","YARD","YOKE",
    ];
    function generateWatchCode() {
      const pick = () => WATCH_WORDS[Math.floor(Math.random() * WATCH_WORDS.length)];
      let a = pick(), b = pick();
      while (b === a) b = pick();
      return a + "-" + b;
    }

    // ── Observer display component ─────────────────────────────────────────────
    function ObserverDisplay({ state, code, onDisconnect, onSendCmd }) {
      const {
        running: obsRunning, paused: obsPaused, resuming: obsResuming, phase, setComplete: sc,
        currentBeat, currentBar, exercise, nextEx, countInBeat,
        mode: obsMode, bpm: obsBpm, timeSig: obsTimeSigLabel,
        barsPerExercise: obsBpe, exerciseLength: obsExLen,
        countInBars: obsCib, countInEvery: obsCountInEvery,
        looping: obsLooping, letterMode: obsLm,
        minEx: obsMinEx, maxEx: obsMaxEx,
        pickedNums: obsPickedNums, exMode: obsExMode,
        disconnected,
      } = state || {};

      const [openSelector, setOpenSelector] = React.useState(null);
      const [pickerOpen, setPickerOpen] = React.useState(false);
      const [numpadOpen, setNumpadOpen] = React.useState(null);
      const tapTimesObs = React.useRef([]);
      const [tapped, setTapped] = React.useState(false);
      const [letterModeOverride, setLetterModeOverride] = React.useState(null);
      const letterLongPressObs = React.useRef(null);
      const effectiveLm = letterModeOverride !== null ? letterModeOverride : !!obsLm;

      const obsBpmRef = React.useRef(obsBpm);
      React.useEffect(() => { obsBpmRef.current = obsBpm; }, [obsBpm]);
      const incObsBpm = React.useCallback(() => {
        if (disabled) return;
        onSendCmd({ bpm: Math.min(300, (obsBpmRef.current || 80) + 1) });
      }, [disabled, onSendCmd]);
      const decObsBpm = React.useCallback(() => {
        if (disabled) return;
        onSendCmd({ bpm: Math.max(30, (obsBpmRef.current || 80) - 1) });
      }, [disabled, onSendCmd]);
      const bpmObsIncHandlers = useLongPress(incObsBpm);
      const bpmObsDecHandlers = useLongPress(decObsBpm);

      const beatsPerBar = parseInt(obsTimeSigLabel) || 4;
      const exLen = obsExLen || 1;
      const bpe = obsBpe || 4;
      const currentRound = Math.floor((currentBar || 0) / exLen) + 1;
      const isCountIn = phase === "countin";
      const isPlaying = phase === "playing";
      const isIdle = !obsRunning && !obsPaused;
      const disabled = !!disconnected;
      const obsTimeSig = TIME_SIGS.find(t => t.label === obsTimeSigLabel) || TIME_SIGS[2];
      const exMode = obsExMode || "range";
      const pickedNums = obsPickedNums || [];
      const validRange = obsMode === "clickonly" ? true
        : exMode === "pick" ? pickedNums.length >= 1
        : (obsMinEx || 1) <= (obsMaxEx || 1);

      const modeLabel = { fullset: "Shuffle", sequential: "Sequential", random: "Random", clickonly: "Metronome" }[obsMode] || obsMode;

      const handleTapBpm = () => {
        if (disabled || obsRunning) return;
        const now = Date.now();
        tapTimesObs.current = [...tapTimesObs.current.filter(t => now - t < 3000), now];
        if (tapTimesObs.current.length >= 2) {
          const intervals = tapTimesObs.current.slice(1).map((t, i) => t - tapTimesObs.current[i]);
          const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const newBpm = Math.round(60000 / avg);
          if (newBpm >= 30 && newBpm <= 300) onSendCmd({ bpm: newBpm });
        }
        setTapped(true);
        setTimeout(() => setTapped(false), 100);
      };

      return (
        <div className="observer-app">
          <div className="watching-banner">
            <span className="watching-code-text"
              onPointerDown={() => { letterLongPressObs.current = setTimeout(() => { const next = !effectiveLm; setLetterModeOverride(next); onSendCmd({ letterMode: next }); letterLongPressObs.current = null; }, 800); }}
              onPointerUp={() => { if (letterLongPressObs.current) { clearTimeout(letterLongPressObs.current); letterLongPressObs.current = null; } }}
              onPointerLeave={() => { if (letterLongPressObs.current) { clearTimeout(letterLongPressObs.current); letterLongPressObs.current = null; } }}
              style={{ userSelect: "none" }}>watching <span>{code}</span></span>
            <button className="watching-disconnect-btn" onClick={onDisconnect}>stop</button>
          </div>

          {disconnected && <div className="observer-offline">Session ended</div>}

          <div className="display" style={{ maxWidth: 440 }}>
            <div className="exercise-label">
              {isCountIn ? "count in" : sc ? "\u00A0" : isIdle ? "ready" : obsMode === "clickonly" ? "bar" : "exercise"}
            </div>

            {isCountIn ? (
              <div className="countdown-display">
                {countInBeat > 0 ? (((countInBeat - 1) % beatsPerBar) + 1 < 10 ? "0" : "") + (((countInBeat - 1) % beatsPerBar) + 1) : "--"}
              </div>
            ) : sc ? (
              <div className="exercise-number done">done</div>
            ) : (
              <div className={`exercise-number${isIdle ? " idle" : ""}`}>
                {exercise != null ? (effectiveLm ? String.fromCharCode(64 + exercise) : (exercise < 10 ? "0" + exercise : "" + exercise)) : "--"}
              </div>
            )}

            {!sc && (
              isIdle ? (
                <div className="idle-summary">
                  {obsMode === "clickonly"
                    ? `${obsBpm || "--"} bpm · ${obsTimeSigLabel || "--"} · metronome`
                    : exMode === "pick"
                      ? `${pickedNums.length === 0 ? "no bars" : pickedNums.length > 4 ? `${pickedNums.length} exercises` : pickedNums.map(n => effectiveLm ? numToLetter(n) : String(n)).join(", ")} · ${obsBpe || "--"} round${obsBpe !== 1 ? "s" : ""} · ${obsMode === "fullset" ? "shuffle" : obsMode === "random" ? "random" : obsMode === "sequential" ? "sequential" : obsMode || "--"}`
                      : `${effectiveLm ? numToLetter(obsMinEx || 1) : String(obsMinEx || 1)}–${effectiveLm ? numToLetter(obsMaxEx || 1) : String(obsMaxEx || 1)} · ${obsExLen || "--"}-bar ex · ${obsBpe || "--"} round${obsBpe !== 1 ? "s" : ""} · ${obsMode === "fullset" ? "shuffle" : obsMode === "random" ? "random" : obsMode === "sequential" ? "sequential" : obsMode || "--"}`}
                </div>
              ) : (
                <div className="next-exercise">
                  {obsPaused
                    ? <span style={{ fontSize: "0.6em", color: "#444", letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: "Share Tech Mono, monospace" }}>paused</span>
                    : obsResuming
                      ? <><span className="next-label">resuming</span>{exercise != null ? (effectiveLm ? String.fromCharCode(64 + exercise) : (exercise < 10 ? "0" + exercise : "" + exercise)) : "--"}</>
                      : obsLooping
                        ? <span style={{ fontSize: "0.6em", color: "#555", letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: "Share Tech Mono, monospace" }}>looping</span>
                        : nextEx === -1 && phase === "playing"
                          ? <span style={{ fontSize: "0.6em", color: "#555", letterSpacing: "0.2em", textTransform: "uppercase" }}>last exercise</span>
                          : nextEx != null && (phase === "playing" || phase === "countin")
                            ? <><span className="next-label">up next</span>{effectiveLm ? String.fromCharCode(64 + (nextEx === -1 ? exercise : nextEx)) : ((nextEx === -1 ? exercise : nextEx) < 10 ? "0" + (nextEx === -1 ? exercise : nextEx) : "" + (nextEx === -1 ? exercise : nextEx))}</>
                            : "\u00A0"}
                </div>
              )
            )}

            {!sc && (
              <div className="beat-dots">
                {Array.from({ length: beatsPerBar }).map((_, i) => (
                  <div key={i} className={`beat-dot${isIdle ? " inactive" : ""}${i === 0 ? " beat1" : ""}${isPlaying && !obsPaused && (currentBeat || 0) === i ? " active" : ""}`} />
                ))}
              </div>
            )}

            {!sc && obsMode !== "clickonly" && (
              <BarProgress
                barsPerExercise={bpe}
                currentRound={currentRound}
                currentBar={currentBar || 0}
                exerciseLength={exLen}
                looping={obsLooping}
                phase={phase || "idle"}
                countInBars={obsCib || 1}
                countInBeat={countInBeat || 0}
                beatsPerBar={beatsPerBar}
                barFlash={false}
              />
            )}
          </div>


          <div className="observer-controls">
            <div className="section-grid controls-grid">

              <div className={`control-group full-width${obsRunning ? " dimmed" : ""}`}>
                <label>Mode</label>
                <div className="selector-row">
                  {[
                    { label: "Shuffle",    value: "fullset" },
                    { label: "Sequential", value: "sequential" },
                    { label: "Random",     value: "random" },
                    { label: "Metronome",  value: "clickonly" },
                  ].map(m => (
                    <button key={m.value}
                      className={`sel-btn${obsMode === m.value ? " active" : ""}`}
                      onClick={() => onSendCmd({ mode: m.value })} disabled={disabled || obsRunning}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="control-group">
                <label>BPM</label>
                <div className="bpm-widget">
                  <button className="bpm-btn left" disabled={disabled} {...bpmObsDecHandlers}>−</button>
                  <div className={`bpm-tap${tapped ? " tapped" : ""}`}
                    onClick={!disabled && !obsRunning ? handleTapBpm : undefined}
                    style={(disabled || obsRunning) ? { cursor: "default", pointerEvents: "none" } : {}}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                      <span>{obsBpm || "--"}</span>
                      {!disabled && !obsRunning && <span className="bpm-tap-label">tap to set</span>}
                    </div>
                  </div>
                  <button className="bpm-btn right" disabled={disabled} {...bpmObsIncHandlers}>+</button>
                </div>
              </div>

              <div className={`control-group${obsRunning ? " dimmed" : ""}`}>
                <label>Time signature</label>
                <CompactSelector
                  id="obs-timeSig"
                  value={obsTimeSig}
                  options={TIME_SIGS}
                  onChange={ts => onSendCmd({ timeSig: ts.label })}
                  disabled={disabled || obsRunning}
                  openSelector={openSelector}
                  setOpenSelector={setOpenSelector}
                  getLabel={ts => ts.label}
                />
              </div>

              <div className={`control-group${obsRunning ? " dimmed" : ""}`}>
                <label>Count in</label>
                <CompactSelector
                  id="obs-countIn"
                  value={obsCib || 1}
                  options={[1, 2, 4]}
                  onChange={n => onSendCmd({ countInBars: n })}
                  disabled={disabled || obsRunning}
                  openSelector={openSelector}
                  setOpenSelector={setOpenSelector}
                  getLabel={n => n === 1 ? "1 bar" : n + " bars"}
                  buttonLabel={(obsCib === 1 ? "1 bar" : (obsCib || 1) + " bars") + (obsCountInEvery && obsMode !== "clickonly" ? " \u2713" : "")}
                  footer={
                    <div className={"check-row" + (obsMode === "clickonly" ? " disabled" : "")} style={{ width: "100%", padding: "0.1rem 0" }}>
                      <input type="checkbox" checked={!!obsCountInEvery}
                        onChange={() => onSendCmd({ countInEvery: !obsCountInEvery })}
                        disabled={disabled || obsMode === "clickonly"}
                        style={{ accentColor: "#ff4500", width: 18, height: 18 }} />
                      <span>Count in every exercise</span>
                    </div>
                  }
                />
              </div>

              <div className={`control-group${obsMode === "clickonly" || obsRunning || exMode === "pick" ? " dimmed" : ""}`}>
                <label>Exercise length</label>
                <CompactSelector
                  id="obs-exLength"
                  value={obsExLen || 1}
                  options={[1, 2, 4]}
                  onChange={n => onSendCmd({ exerciseLength: n })}
                  disabled={disabled || obsRunning || obsMode === "clickonly" || exMode === "pick"}
                  openSelector={openSelector}
                  setOpenSelector={setOpenSelector}
                  getLabel={n => n === 1 ? "1 bar" : n + " bars"}
                />
              </div>

              <div className={`control-group${obsRunning || obsMode === "clickonly" ? " dimmed" : ""}`}>
                <label>Exercises</label>
                <div className="ex-control-row">
                  {exMode !== "pick" ? (
                    <div className="range-row">
                      <input type="text" readOnly
                        value={effectiveLm ? String.fromCharCode(64 + (obsMinEx || 1)) : (obsMinEx != null ? String(obsMinEx) : "--")}
                        disabled={disabled || obsRunning || obsMode === "clickonly"}
                        onPointerDown={e => { e.preventDefault(); if (!disabled && !obsRunning && obsMode !== "clickonly") setNumpadOpen("min"); }}
                        style={{ cursor: disabled || obsRunning || obsMode === "clickonly" ? "default" : "pointer" }} />
                      <span>to</span>
                      <input type="text" readOnly
                        value={effectiveLm ? String.fromCharCode(64 + (obsMaxEx || 1)) : (obsMaxEx != null ? String(obsMaxEx) : "--")}
                        disabled={disabled || obsRunning || obsMode === "clickonly"}
                        onPointerDown={e => { e.preventDefault(); if (!disabled && !obsRunning && obsMode !== "clickonly") setNumpadOpen("max"); }}
                        style={{ cursor: disabled || obsRunning || obsMode === "clickonly" ? "default" : "pointer" }} />
                    </div>
                  ) : (
                    <button
                      className={"pick-trigger-btn" + (pickedNums.length === 0 ? " empty" : "") + (pickedNums.length === 0 && !obsRunning && obsMode !== "clickonly" ? " invalid" : "")}
                      disabled={disabled || obsRunning || obsMode === "clickonly"}
                      onClick={() => setPickerOpen(true)}>
                      {pickedNums.length === 0 ? "Tap to select..." : pickedNums.map(n => effectiveLm ? String.fromCharCode(64 + n) : (n < 10 ? "0" + n : "" + n)).join(", ")}
                    </button>
                  )}
                  <div className="ex-mode-toggle">
                    <button className={"ex-mode-btn" + (exMode !== "pick" ? " active" : "")}
                      disabled={disabled || obsRunning || obsMode === "clickonly"}
                      onClick={() => onSendCmd({ exMode: "range" })}>Range</button>
                    <button className={"ex-mode-btn" + (exMode === "pick" ? " active" : "")}
                      disabled={disabled || obsRunning || obsMode === "clickonly"}
                      onClick={() => onSendCmd({ exMode: "pick", exerciseLength: 1 })}>Pick</button>
                  </div>
                </div>
              </div>

              <div className={`control-group${obsMode === "clickonly" || obsRunning ? " dimmed" : ""}`}>
                <label>Rounds</label>
                <div className="stepper">
                  <button className="stepper-btn left" disabled={disabled || obsRunning || obsMode === "clickonly"}
                    onClick={() => onSendCmd({ barsPerExercise: Math.max(1, (obsBpe || 4) - 1) })}>−</button>
                  <div className="stepper-val" style={obsMode === "clickonly" || obsRunning ? { opacity: 0.25 } : {}}>{obsBpe || "--"}</div>
                  <button className="stepper-btn right" disabled={disabled || obsRunning || obsMode === "clickonly"}
                    onClick={() => onSendCmd({ barsPerExercise: Math.min(32, (obsBpe || 4) + 1) })}>+</button>
                </div>
              </div>

            </div>
          </div>

          <div className="btn-row" style={{ width: "100%", maxWidth: 440 }}>
            {!obsRunning ? (
              <button className="action-btn" disabled={disabled || !validRange}
                onClick={() => onSendCmd({ tcmd: "start", tseq: Date.now() })}>Start</button>
            ) : (
              <>
                <div className="btn-group">
                  <button className={`action-btn${obsPaused ? " pause-active" : " secondary"}`} disabled={disabled}
                    onClick={() => onSendCmd({ tcmd: obsPaused ? "resume" : "pause", tseq: Date.now() })}>
                    {obsPaused ? "Resume" : "Pause"}
                  </button>
                  {obsMode !== "clickonly" && (
                    <button className={`action-btn${obsLooping ? " loop-active" : " secondary"}`} disabled={disabled}
                      onClick={() => onSendCmd({ tcmd: "loop", tseq: Date.now() })}>Loop</button>
                  )}
                  <button className="action-btn stop" disabled={disabled}
                    onClick={() => onSendCmd({ tcmd: "stop", tseq: Date.now() })}>Stop</button>
                </div>
              </>
            )}
          </div>

          {numpadOpen === "min" && (
            <NumpadPopup label="Min exercise" initialValue={obsMinEx || 1}
              onConfirm={v => { setNumpadOpen(null); onSendCmd({ minEx: v }); }}
              onClose={() => setNumpadOpen(null)} letterMode={effectiveLm} />
          )}
          {numpadOpen === "max" && (
            <NumpadPopup label="Max exercise" initialValue={obsMaxEx || 1}
              onConfirm={v => { setNumpadOpen(null); onSendCmd({ maxEx: v }); }}
              onClose={() => setNumpadOpen(null)} letterMode={effectiveLm} />
          )}
          {pickerOpen && (
            <BarPickerPopup
              pickedNums={pickedNums}
              onConfirm={nums => { setPickerOpen(false); onSendCmd({ pickedNums: nums, exMode: "pick" }); }}
              onClose={() => setPickerOpen(false)}
              letterMode={effectiveLm} />
          )}
        </div>
      );
    }

"""
src = src.replace(
    "    const { useState, useEffect, useRef, useCallback } = React;\n",
    "    const { useState, useEffect, useRef, useCallback } = React;\n" + firebase_and_observer
)

# ── 5. Watch state variables (into App, after wakeLock ref) ──────────────────

watch_state = """
      // ── Watch mode state ───────────────────────────────────────────────────
      // "home" | "share" | "watch-entry" | "watching"
      const [watchScreen,     setWatchScreen]     = useState("home");
      const [shareCode,       setShareCode]       = useState("");
      const [watchEntryCode,  setWatchEntryCode]  = useState("");
      const [watchEntryError, setWatchEntryError] = useState("");
      const [observedState,   setObservedState]   = useState(null);
      const [watchCode,       setWatchCode]       = useState("");
      const [teacherConnected, setTeacherConnected] = useState(false);
      const watchDbRef      = useRef(null);
      const shareDbRef      = useRef(null);
      const shareInterval   = useRef(null);
      const cmdDbRef        = useRef(null);
      const lastTSeq        = useRef(0);
      const watchSilentLoop = useRef(null);

"""
src = src.replace(
    "      const letterLongPress = useRef(null);\n      const tapTimes = useRef([]);\n      const wakeLock = useRef(null);\n",
    "      const letterLongPress = useRef(null);\n      const tapTimes = useRef([]);\n      const wakeLock = useRef(null);\n" + watch_state
)

# ── 6. Watch effects and handlers (after useDrumTimer, before showMuteHint) ──

watch_effects = """      // ── Watch: manage silent loop to keep AudioContext alive while sharing ──
      // Stop it when useDrumTimer takes over (running=true); restart when idle.
      useEffect(() => {
        if ((watchScreen !== "share" && watchScreen !== "app")) return;
        if (running) {
          if (watchSilentLoop.current) {
            try { watchSilentLoop.current.stop(); } catch {}
            watchSilentLoop.current = null;
          }
        } else {
          if (!watchSilentLoop.current) {
            try {
              const ctx = getCtx();
              ctx.resume().catch(() => {});
              const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
              const src = ctx.createBufferSource();
              src.buffer = buf; src.loop = true;
              const gain = ctx.createGain(); gain.gain.value = 0.001;
              src.connect(gain); gain.connect(ctx.destination); src.start();
              watchSilentLoop.current = src;
            } catch(e) {}
          }
        }
      }, [running, watchScreen]);

      // ── Watch: broadcast live state when sharing ──────────────────────────
      useEffect(() => {
        if ((watchScreen !== "share" && watchScreen !== "app") || !shareDbRef.current) return;
        const payload = {
          running, paused, resuming: isResuming, looping, phase, setComplete,
          currentBeat, currentBar, exercise, nextEx, countInBeat,
          mode, bpm, timeSig: timeSig.label, barsPerExercise, exerciseLength,
          minEx, maxEx, countInBars, countInEvery, letterMode,
          exMode, pickedNums,
          ts: Date.now(),
        };
        shareDbRef.current.set(payload);
      }, [running, paused, isResuming, looping, phase, setComplete, currentBeat, currentBar,
          exercise, nextEx, countInBeat, mode, bpm, timeSig, barsPerExercise,
          exerciseLength, minEx, maxEx, countInBars, countInEvery, letterMode,
          exMode, pickedNums, watchScreen]);


      // ── Watch: clean up on unmount ─────────────────────────────────────────
      useEffect(() => {
        return () => {
          if (shareInterval.current) clearInterval(shareInterval.current);
          if (watchDbRef.current) { watchDbRef.current.off(); }
        };
      }, []);

      // ── Watch: resume AudioContext when app returns to foreground ───────────
      // iOS suspends the AudioContext when the app goes to background. This
      // visibilitychange handler resumes it when the student returns so the
      // context is ready before the teacher triggers Start.
      useEffect(() => {
        if (watchScreen !== "app") return;
        const onVisible = () => {
          if (document.visibilityState === "visible") {
            try { const ctx = getCtx(); ctx.resume().catch(() => {}); } catch(e) {}
          }
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
      }, [watchScreen]);

      // ── Watch: handlers ────────────────────────────────────────────────────
      const handleStartSharing = useCallback(() => {
        // Reset to defaults so each session starts clean
        setBpm(80);
        setTimeSig(TIME_SIGS[2]);
        setBarsPerExercise(4);
        setExerciseLength(1);
        setMinEx(1); setMinExStr("1");
        setMaxEx(4); setMaxExStr("4");
        setCountInBars(1);
        setCountInEvery(true);
        setMode(MODE_FULLSET);
        setExMode("range");
        setPickedNums([]);
        setLetterMode(false);
        // Clean up stale silent loop so a fresh one is created on "Open Shuffle" tap
        if (watchSilentLoop.current) {
          try { watchSilentLoop.current.stop(); } catch {}
          watchSilentLoop.current = null;
        }
        const code = generateWatchCode();
        setShareCode(code);
        const ref = _db.ref("sessions/" + code + "/state");
        shareDbRef.current = ref;
        _db.ref("sessions/" + code).onDisconnect().remove();
        setWatchScreen("share");
      }, []);

      const handleStopSharing = useCallback(() => {
        if (shareCode) _db.ref("sessions/" + shareCode).remove();
        shareDbRef.current = null;
        setShareCode("");
        setTeacherConnected(false);
        if (watchSilentLoop.current) { try { watchSilentLoop.current.stop(); } catch {} watchSilentLoop.current = null; }
        setWatchScreen("home");
      }, [shareCode]);

      const handleConnectWatch = useCallback((code) => {
        const stateRef = _db.ref("sessions/" + code + "/state");
        stateRef.once("value").then(snap => {
          if (!snap.exists()) {
            setWatchEntryError("Session not found. Check the code and try again.");
            return;
          }
          watchDbRef.current = stateRef;
          setWatchCode(code);
          setObservedState(snap.val());
          setWatchScreen("watching");
          _db.ref("sessions/" + code + "/cmds").set({ tcmd: "connected", tseq: Date.now() });
          stateRef.on("value", s => {
            if (s.exists()) {
              setObservedState(s.val());
            } else {
              setObservedState(prev => prev ? { ...prev, disconnected: true } : null);
            }
          });
        }).catch(() => {
          setWatchEntryError("Could not connect. Check your internet connection.");
        });
      }, []);

      const handleDisconnectWatch = useCallback(() => {
        if (watchDbRef.current) { watchDbRef.current.off(); watchDbRef.current = null; }
        setObservedState(null);
        setWatchCode("");
        setWatchEntryCode("");
        setWatchEntryError("");
        setWatchScreen("home");
      }, []);

      // ── Watch: listen for teacher commands when sharing ────────────────────
      useEffect(() => {
        if (watchScreen !== "share" && watchScreen !== "app") return;
        if (!shareDbRef.current) return;
        const cmdsRef = _db.ref("sessions/" + shareCode + "/cmds");
        cmdDbRef.current = cmdsRef;
        cmdsRef.on("value", snap => {
          if (!snap.exists()) return;
          const cmd = snap.val();
          if (cmd.tcmd && cmd.tseq && cmd.tseq > lastTSeq.current) {
            lastTSeq.current = cmd.tseq;
            if      (cmd.tcmd === "connected") { setTeacherConnected(true); }
            else if (cmd.tcmd === "start")  { setSetComplete(false); setExercise(null); setNextEx(null); setExerciseKey(0); setPaused(false); setLooping(false); setResuming(false); setRunning(true); }
            else if (cmd.tcmd === "stop")   { setRunning(false); setPaused(false); setLooping(false); setResuming(false); setExercise(null); setNextEx(null); setExerciseKey(0); setSetComplete(false); }
            else if (cmd.tcmd === "pause")  { setResuming(false); setPaused(true); }
            else if (cmd.tcmd === "resume") { setResuming(true); setPaused(false); }
            else if (cmd.tcmd === "loop")   { setLooping(l => !l); }
          }
          if (cmd.bpm != null) setBpm(Math.min(300, Math.max(30, Math.round(cmd.bpm))));
          if (cmd.mode != null) setMode(cmd.mode);
          if (cmd.timeSig != null) { const ts = TIME_SIGS.find(t => t.label === cmd.timeSig); if (ts) setTimeSig(ts); }
          if (cmd.countInBars != null) setCountInBars(cmd.countInBars);
          if (cmd.countInEvery != null) setCountInEvery(!!cmd.countInEvery);
          if (cmd.exerciseLength != null) setExerciseLength(cmd.exerciseLength);
          if (cmd.minEx != null) { const v = Math.min(200, Math.max(1, cmd.minEx)); setMinEx(v); setMinExStr(String(v)); }
          if (cmd.maxEx != null) { const v = Math.min(200, Math.max(1, cmd.maxEx)); setMaxEx(v); setMaxExStr(String(v)); }
          if (cmd.barsPerExercise != null) setBarsPerExercise(cmd.barsPerExercise);
          if (cmd.exMode != null) setExMode(cmd.exMode);
          if (cmd.pickedNums != null) setPickedNums(Array.isArray(cmd.pickedNums) ? cmd.pickedNums.map(Number) : []);
          if (cmd.letterMode != null) setLetterMode(!!cmd.letterMode);
        });
        return () => { cmdsRef.off(); cmdDbRef.current = null; };
      }, [watchScreen, shareCode]);

      // ── Watch: auto-disconnect teacher after 30 min idle ──────────────────
      useEffect(() => {
        if (watchScreen !== "watching" || !observedState) return;
        const timer = setTimeout(() => handleDisconnectWatch(), 30 * 60 * 1000);
        return () => clearTimeout(timer);
      }, [watchScreen, observedState && observedState.ts]);

      // ── Watch: send command to student ────────────────────────────────────
      const handleSendCmd = useCallback((cmdPatch) => {
        if (!watchCode) return;
        _db.ref("sessions/" + watchCode + "/cmds").set(cmdPatch);
      }, [watchCode]);

"""
src = src.replace(
    '\n\n      useEffect(() => {\n        if (!showMuteHint || phase !== "playing") return;',
    '\n\n' + watch_effects + '      useEffect(() => {\n        if (!showMuteHint || phase !== "playing") return;',
    1
)

# ── 6a-ii. Force letterMode to false in Watch — never load from localStorage ──
# Watch always starts in Number Mode regardless of what the student's main app
# had saved. Prevents Letter Mode from persisting into a watch session.
src = src.replace(
    "      const [letterMode,          setLetterMode]          = useState(() => saved?.letterMode ?? false);",
    "      const [letterMode,          setLetterMode]          = useState(false);"
)

# ── 6b. Expose getCtx from useDrumTimer so App can use it for watchSilentLoop ──
# getCtx is defined inside useDrumTimer but the "Open Shuffle" button needs it
# in App scope to create the silent loop that keeps the AudioContext alive.
src = src.replace(
    "      return { currentBeat, currentBar, phase, flashOn, countInBeat, isResuming };",
    "      return { currentBeat, currentBar, phase, flashOn, countInBeat, isResuming, getCtx };"
)
src = src.replace(
    "      const { currentBeat, currentBar, phase, flashOn, countInBeat, isResuming } = useDrumTimer({",
    "      const { currentBeat, currentBar, phase, flashOn, countInBeat, isResuming, getCtx } = useDrumTimer({"
)

# ── 6c. Prevent AudioContext close when student is sharing ───────────────────
# When the student is sharing (watchScreen === "app"), closing the AudioContext
# on stop means the next teacher-triggered Start creates a new suspended context
# that can't be resumed outside a user gesture. Keep it alive instead.
src = src.replace(
    "    function useDrumTimer({ bpm, beatsPerBar, barsPerExercise, minEx, maxEx,\n"
    "                            onNewExercise, onNextExercise, onSetComplete,\n"
    "                            running, paused, resuming,\n"
    "                            countInBars, countInEveryRound,\n"
    "                            mode, volume, looping, setComplete,\n"
    "                            exMode, pickedNums }) {",
    "    function useDrumTimer({ bpm, beatsPerBar, barsPerExercise, minEx, maxEx,\n"
    "                            onNewExercise, onNextExercise, onSetComplete,\n"
    "                            running, paused, resuming,\n"
    "                            countInBars, countInEveryRound,\n"
    "                            mode, volume, looping, setComplete,\n"
    "                            exMode, pickedNums, keepCtxAlive }) {"
)
src = src.replace(
    "          if (setComplete) {\n"
    "            setTimeout(() => {\n"
    "              if (audioCtx.current) { try { audioCtx.current.close(); } catch {} audioCtx.current = null; }\n"
    "            }, 150);\n"
    "          } else {\n"
    "            if (audioCtx.current) { try { audioCtx.current.close(); } catch {} audioCtx.current = null; }\n"
    "          }",
    "          if (!keepCtxAlive) {\n"
    "            if (setComplete) {\n"
    "              setTimeout(() => {\n"
    "                if (audioCtx.current) { try { audioCtx.current.close(); } catch {} audioCtx.current = null; }\n"
    "              }, 150);\n"
    "            } else {\n"
    "              if (audioCtx.current) { try { audioCtx.current.close(); } catch {} audioCtx.current = null; }\n"
    "            }\n"
    "          }"
)
src = src.replace(
    "        mode, volume, looping, setComplete,\n        exMode, pickedNums,\n      });",
    "        mode, volume, looping, setComplete,\n        exMode, pickedNums,\n        keepCtxAlive: watchScreen === \"app\",\n      });"
)

# ── 7. Wrap JSX return with watch overlays ───────────────────────────────────

old_return_open = '      return (\n        <div className="app">'
watch_jsx = """      // If watching someone else, show observer view entirely
      if (watchScreen === "watching" && observedState) {
        return <ObserverDisplay state={observedState} code={watchCode} onDisconnect={handleDisconnectWatch} onSendCmd={handleSendCmd} />;
      }

      return (
        <>
        {/* Watch mode overlays */}
        {watchScreen === "home" && (
          <div className="watch-overlay">
            <div className="watch-overlay-title">Shuffle</div>
            <div className="watch-overlay-subtitle">Watch</div>
            <button className="watch-btn primary" onClick={handleStartSharing}>Share my session</button>
            <button className="watch-btn secondary" onClick={() => setWatchScreen("watch-entry")}>Watch a session</button>
            <div style={{ fontSize: "0.55rem", color: "#444", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", marginTop: "0.5rem" }}>v1.8.2 · watch 1.5</div>
          </div>
        )}
        {watchScreen === "share" && (
          <div className="watch-overlay">
            <div className="watch-overlay-title">Shuffle</div>
            <div className="watch-overlay-subtitle">Sharing</div>
            <div className="share-session-label">Your session code</div>
            <div className="share-session-code">{shareCode}</div>
            {teacherConnected
              ? <div className="share-session-hint" style={{ color: "#4caf50" }}>Teacher connected — tap Open Shuffle to begin.</div>
              : <div className="share-session-hint">Open shuffleclick.com/watch on another device and enter this code.</div>}
            <button className="watch-btn primary" onClick={() => { try { const ctx = getCtx(); ctx.resume().catch(() => {}); if (!watchSilentLoop.current) { const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; const gain = ctx.createGain(); gain.gain.value = 0.001; src.connect(gain); gain.connect(ctx.destination); src.start(); watchSilentLoop.current = src; } } catch(e) {} setWatchScreen("app"); }}>Open Shuffle</button>
            <button className="watch-btn secondary" onClick={handleStopSharing}>Stop sharing</button>
          </div>
        )}
        {watchScreen === "watch-entry" && (
          <div className="watch-overlay">
            <div className="watch-overlay-title">Shuffle</div>
            <div className="watch-overlay-subtitle">Watch</div>
            <input
              className="watch-code-input"
              type="text"
              maxLength={13}
              placeholder="WORD-WORD"
              value={watchEntryCode}
              onChange={e => { setWatchEntryCode(e.target.value.toUpperCase().replace(/[^A-Z-]/g, "")); setWatchEntryError(""); }}
              onKeyDown={e => {
                if (e.key === " ") { e.preventDefault(); setWatchEntryCode(c => (c.includes("-") ? c : c + "-").replace(/[^A-Z-]/g, "")); setWatchEntryError(""); }
                if (e.key === "Enter" && watchEntryCode.includes("-")) handleConnectWatch(watchEntryCode);
              }}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
            {watchEntryError && <div className="watch-entry-error">{watchEntryError}</div>}
            <button className="watch-connect-btn" disabled={!watchEntryCode.includes("-")} onClick={() => handleConnectWatch(watchEntryCode)}>Connect</button>
            <button className="watch-back-btn" onClick={() => { setWatchScreen("home"); setWatchEntryCode(""); setWatchEntryError(""); }}>← back</button>
          </div>
        )}
        <div className="app" style={watchScreen === "app" || watchScreen === "share" ? {} : { display: "none" }}>"""

src = src.replace(old_return_open, watch_jsx, 1)

old_close = '\n        </div>\n      );'
new_close = '\n        </div>\n        </>\n      );'
last_idx = src.rfind(old_close)
src = src[:last_idx] + new_close + src[last_idx + len(old_close):]

# ── 8. Replace left header spacer with sharing indicator ────────────────────

src = src.replace(
    '            <div className="app-header-spacer" />',
    '            <div className="app-header-spacer" />',
    1
)

# Replace help button with sharing indicator when sharing, hide help entirely
src = src.replace(
    '            <button className={`help-btn app-header-spacer${helpPulse ? \' help-btn-pulse\' : \'\'}`}',
    '            {watchScreen === "app"\n'
    '              ? <div className="sharing-indicator" onClick={() => setWatchScreen("share")} title="Sharing">\n'
    '                  <div className="sharing-indicator-dot" style={{ animationDuration: `${Math.round(120000 / bpm)}ms` }} />\n'
    '                </div>\n'
    '              : <button className={`help-btn app-header-spacer${helpPulse ? \' help-btn-pulse\' : \'\'}`}',
    1
)
# Close the conditional — find the end of the help button JSX and add the closing brace
src = src.replace(
    '            }}>?</button>',
    '            }}>?</button>}',
    1
)

# ── 9. Strip beta suffix from footer version string ─────────────────────────

src = re.sub(r'(v\d+\.\d+\.\d+)\.beta\.\d+', r'\1', src)

# ── Write output ─────────────────────────────────────────────────────────────

with open(DEST, "w") as f:
    f.write(src)

print(f"Built {DEST} ({len(src):,} bytes)")

# Sanity checks
checks = [
    "shuffle-watch-d578b-default-rtdb",
    "generateWatchCode",
    "ObserverDisplay",
    "watchScreen",
    "handleStartSharing",
    "handleConnectWatch",
    "watch-overlay-title",
    "observer-app",
    "handleSendCmd",
    "onSendCmd",
    "cmds",
    "tcmd",
    "tseq",
    "observer-controls",
]
for token in checks:
    if token not in src:
        print(f"  WARNING: '{token}' not found in output")
print("Done.")
