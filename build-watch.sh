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

SRC  = os.path.join(os.path.dirname(__file__), "test", "index.html")
DEST = os.path.join(os.path.dirname(__file__), "watch", "index.html")

with open(SRC, "r") as f:
    src = f.read()

# ── 1. Head patches ──────────────────────────────────────────────────────────

src = src.replace("<title>Shuffle</title>", "<title>Shuffle · Watch</title>")
src = src.replace(
    '<meta name="apple-mobile-web-app-title" content="Shuffle" />',
    '<meta name="apple-mobile-web-app-title" content="Shuffle Watch" />'
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
      color: #f5c842; font-family: var(--font-mono); font-size: 1.5rem;
      letter-spacing: 0.3em; text-align: center; text-transform: uppercase;
      outline: none; caret-color: #f5c842;
    }
    .watch-code-input::placeholder { color: #333; letter-spacing: 0.2em; }
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
    /* Observer display */
    .observer-app {
      position: fixed; inset: 0; background: #0f0f0f; display: flex;
      flex-direction: column; align-items: center; justify-content: flex-start;
      padding-left: 1.5rem; padding-right: 1.5rem;
      padding-top: max(1rem, env(safe-area-inset-top));
      padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
      gap: 0.75rem; overflow: clip;
    }
    .watching-banner {
      display: flex; align-items: center; justify-content: space-between;
      width: 100%; max-width: 440px;
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
"""
src = src.replace("  </style>", watch_css + "  </style>")

# ── 4. Firebase init + ObserverDisplay component ─────────────────────────────

firebase_and_observer = r"""
    // ── Firebase (watch feature) ───────────────────────────────────────────────
    let _db;
    try {
      const _app = firebase.initializeApp({
        apiKey: "AIzaSyDKdwYMTi7RWI3iRoGooQ4ScdrNy8lB1G0",
        authDomain: "shuffle-watch-d578b.firebaseapp.com",
        projectId: "shuffle-watch-d578b",
        storageBucket: "shuffle-watch-d578b.firebasestorage.app",
        messagingSenderId: "173594856788",
        appId: "1:173594856788:web:c96078f9d9df5d41e24cc1",
        databaseURL: "https://shuffle-watch-d578b-default-rtdb.europe-west1.firebasedatabase.app",
      });
      _db = firebase.database(_app);
    } catch(e) { _db = firebase.database(); }

    function generateWatchCode() {
      return Math.random().toString(36).slice(2, 10).toUpperCase();
    }

    // ── Observer display component ─────────────────────────────────────────────
    function ObserverDisplay({ state, code, onDisconnect }) {
      const {
        running, paused, phase, setComplete: sc,
        currentBeat, currentBar, exercise, nextEx, countInBeat,
        mode: obsMode, bpm: obsBpm, timeSig: obsTimeSigLabel,
        barsPerExercise: obsBpe, exerciseLength: obsExLen,
        countInBars: obsCib, looping: obsLooping, letterMode: obsLm,
        disconnected,
      } = state;

      const beatsPerBar = parseInt(obsTimeSigLabel) || 4;
      const exLen = obsExLen || 1;
      const bpe = obsBpe || 4;
      const currentRound = Math.floor((currentBar || 0) / exLen) + 1;
      const isCountIn = phase === "countin";
      const isPlaying = phase === "playing";
      const isIdle = !running && !paused;

      const modeLabel = { fullset: "Shuffle", sequential: "Sequential", random: "Random", clickonly: "Metronome" }[obsMode] || obsMode;

      return (
        <div className="observer-app">
          <div className="watching-banner">
            <span className="watching-code-text">watching <span>{code}</span></span>
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
                {exercise != null ? (obsLm ? String.fromCharCode(64 + exercise) : (exercise < 10 ? "0" + exercise : "" + exercise)) : "--"}
              </div>
            )}

            {!sc && isPlaying && nextEx != null && nextEx !== -1 && !obsLooping && (
              <div className="next-exercise">
                <span className="next-label">up next</span>
                {obsLm ? String.fromCharCode(64 + nextEx) : (nextEx < 10 ? "0" + nextEx : "" + nextEx)}
              </div>
            )}
            {!sc && isPlaying && nextEx === -1 && (
              <div className="next-exercise" style={{ fontSize: "0.6em", color: "#555", letterSpacing: "0.2em", textTransform: "uppercase" }}>last exercise</div>
            )}
            {!sc && obsLooping && isPlaying && (
              <div className="next-exercise" style={{ fontSize: "0.6em", color: "#555", letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: "Share Tech Mono, monospace" }}>looping</div>
            )}
            {!sc && paused && (
              <div className="next-exercise" style={{ fontSize: "0.6em", color: "#444", letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: "Share Tech Mono, monospace" }}>paused</div>
            )}

            {!sc && (
              <div className="beat-dots">
                {Array.from({ length: beatsPerBar }).map((_, i) => (
                  <div key={i} className={`beat-dot${i === 0 ? " beat1" : ""}${isPlaying && !paused && (currentBeat || 0) === i ? " active" : ""}`} />
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

          <div className="observer-info-strip">
            <div className="observer-info-item">
              <span className="observer-info-label">bpm</span>
              <span className="observer-info-value">{obsBpm || "--"}</span>
            </div>
            <div className="observer-info-item">
              <span className="observer-info-label">mode</span>
              <span className="observer-info-value">{modeLabel}</span>
            </div>
            <div className="observer-info-item">
              <span className="observer-info-label">time</span>
              <span className="observer-info-value">{obsTimeSigLabel || "--"}</span>
            </div>
          </div>
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
      const watchDbRef    = useRef(null);
      const shareDbRef    = useRef(null);
      const shareInterval = useRef(null);

"""
src = src.replace(
    "      const letterLongPress = useRef(null);\n      const tapTimes = useRef([]);\n      const wakeLock = useRef(null);\n",
    "      const letterLongPress = useRef(null);\n      const tapTimes = useRef([]);\n      const wakeLock = useRef(null);\n" + watch_state
)

# ── 6. Watch effects and handlers (after useDrumTimer, before showMuteHint) ──

watch_effects = """      // ── Watch: broadcast live state when sharing ──────────────────────────
      useEffect(() => {
        if (watchScreen !== "share" || !shareDbRef.current) return;
        const payload = {
          running, paused, looping, phase, setComplete,
          currentBeat, currentBar, exercise, nextEx, countInBeat,
          mode, bpm, timeSig: timeSig.label, barsPerExercise, exerciseLength,
          minEx, maxEx, countInBars, countInEvery, letterMode,
          ts: Date.now(),
        };
        shareDbRef.current.set(payload);
      }, [running, paused, looping, phase, setComplete, currentBeat, currentBar,
          exercise, nextEx, countInBeat, mode, bpm, timeSig, barsPerExercise,
          exerciseLength, minEx, maxEx, countInBars, countInEvery, letterMode, watchScreen]);

      // ── Watch: clean up on unmount ─────────────────────────────────────────
      useEffect(() => {
        return () => {
          if (shareInterval.current) clearInterval(shareInterval.current);
          if (watchDbRef.current) { watchDbRef.current.off(); }
        };
      }, []);

      // ── Watch: handlers ────────────────────────────────────────────────────
      const handleStartSharing = useCallback(() => {
        const code = generateWatchCode();
        setShareCode(code);
        const ref = _db.ref("sessions/" + code);
        shareDbRef.current = ref;
        ref.onDisconnect().remove();
        setWatchScreen("share");
      }, []);

      const handleStopSharing = useCallback(() => {
        if (shareDbRef.current) { shareDbRef.current.remove(); shareDbRef.current = null; }
        setShareCode("");
        setWatchScreen("home");
      }, []);

      const handleConnectWatch = useCallback((code) => {
        const ref = _db.ref("sessions/" + code);
        ref.once("value").then(snap => {
          if (!snap.exists()) {
            setWatchEntryError("Session not found. Check the code and try again.");
            return;
          }
          watchDbRef.current = ref;
          setWatchCode(code);
          setObservedState(snap.val());
          setWatchScreen("watching");
          ref.on("value", s => {
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

"""
src = src.replace(
    '\nuseEffect(() => {\n        if (!showMuteHint || phase !== "playing") return;',
    '\n' + watch_effects + 'useEffect(() => {\n        if (!showMuteHint || phase !== "playing") return;',
    1
)

# ── 7. Wrap JSX return with watch overlays ───────────────────────────────────

old_return_open = '      return (\n        <div className="app">'
watch_jsx = """      // If watching someone else, show observer view entirely
      if (watchScreen === "watching" && observedState) {
        return <ObserverDisplay state={observedState} code={watchCode} onDisconnect={handleDisconnectWatch} />;
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
          </div>
        )}
        {watchScreen === "share" && (
          <div className="watch-overlay">
            <div className="watch-overlay-title">Shuffle</div>
            <div className="watch-overlay-subtitle">Sharing</div>
            <div className="share-session-label">Your session code</div>
            <div className="share-session-code">{shareCode}</div>
            <div className="share-session-hint">Open shuffleclick.com/watch on the teacher's iPad and enter this code.</div>
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
              maxLength={8}
              placeholder="XXXXXXXX"
              value={watchEntryCode}
              onChange={e => { setWatchEntryCode(e.target.value.toUpperCase()); setWatchEntryError(""); }}
              onKeyDown={e => { if (e.key === "Enter" && watchEntryCode.length === 8) handleConnectWatch(watchEntryCode); }}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
            {watchEntryError && <div className="watch-entry-error">{watchEntryError}</div>}
            <button className="watch-connect-btn" disabled={watchEntryCode.length !== 8} onClick={() => handleConnectWatch(watchEntryCode)}>Connect</button>
            <button className="watch-back-btn" onClick={() => { setWatchScreen("home"); setWatchEntryCode(""); setWatchEntryError(""); }}>← back</button>
          </div>
        )}
        <div className="app" style={watchScreen !== "home" ? {} : { display: "none" }}>"""

src = src.replace(old_return_open, watch_jsx, 1)

old_close = '\n        </div>\n      );'
new_close = '\n        </div>\n        </>\n      );'
last_idx = src.rfind(old_close)
src = src[:last_idx] + new_close + src[last_idx + len(old_close):]

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
]
for token in checks:
    if token not in src:
        print(f"  WARNING: '{token}' not found in output")
print("Done.")
