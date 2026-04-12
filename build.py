#!/usr/bin/env python3
"""
build.py — Builds beta/index.html and watch/index.html from src/.

Always run after any src/ change:
  python3 build.py

Always produces both output files in one pass:
  1. Assembles all src/ files into a single HTML.
  2. Writes beta/index.html immediately (no watch patches, beta version kept).
  3. Applies all watch patches to the assembled source.
  4. Writes watch/index.html with patches applied and beta suffix stripped.

The watch app is the full Shuffle app with a Firebase-powered session sharing
layer added on top. It lives at shuffleclick.com/watch/ and is a private
teacher/student observation tool — not part of the public app.

Watch patches injected after beta is written:
  1. Firebase SDK script tags (after Babel)
  2. Watch-specific CSS (before </style>)
  3. Firebase init + ObserverDisplay component (after React destructuring)
  4. Watch mode state variables (into App)
  5. Watch effects and handlers (into App, after useDrumTimer)
  6. Watch UI overlays (wrapping the JSX return)
"""

import re, sys, os

_patch_warnings = []

def patch(src, old, new, count=None, label=""):
    """Replace old with new, printing a warning if old is not found."""
    if old not in src:
        _patch_warnings.append(label or repr(old[:60]))
        return src
    if count is not None:
        return src.replace(old, new, count)
    return src.replace(old, new)

DEST    = os.path.join(os.path.dirname(__file__), "watch", "index.html")
_SCRIPT = os.path.dirname(__file__)
_SRC    = os.path.join(_SCRIPT, "src")

_SRC_FILES = [
    'constants.js',
    'storage.js',
    'audio.js',
    'useInteraction.js',
    'useDrumTimer.js',
    'components/NumpadComponents.jsx',
    'components/BarProgress.jsx',
    'components/CompactSelector.jsx',
    'components/App.jsx',
]

_IMPORT_RE = re.compile(
    r"^import\s+"
    r"(?:[^'\"]*?|\{[^}]*?\}[^'\"]*?)"
    r"from\s+['\"][^'\"]*['\"];\s*\n?"
    r"|"
    r"^import\s+['\"][^'\"]*['\"];\s*\n?",
    re.MULTILINE | re.DOTALL
)
_EXPORT_DECL = re.compile(r"^export\s+(function|const|class|async\s+function)\s+", re.MULTILINE)

def _transform(source):
    source = _IMPORT_RE.sub('', source)
    source = re.sub(r"^export\s+default\s+", '', source, flags=re.MULTILINE)
    source = _EXPORT_DECL.sub(lambda m: m.group(1) + ' ', source)
    return source

def _indent(source, spaces=4):
    pad = ' ' * spaces
    lines = source.splitlines(keepends=True)
    return ''.join(pad + line if line.strip() else line for line in lines)

def _build_source():
    _HTML_HEAD = '''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Shuffle" />
  <meta name="description" content="Randomise your exercises and keep time with Shuffle — a free tool that helps musicians practise more effectively." />
  <meta property="og:title" content="Shuffle" />
  <meta property="og:description" content="Randomise your exercises and keep time with Shuffle — a free tool that helps musicians practise more effectively." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://shuffleclick.com" />
  <meta property="og:image" content="https://shuffleclick.com/shuffle-icon.png" />
  <title>Shuffle</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow:wght@300;400;600&display=swap" rel="stylesheet" />
  <link rel="apple-touch-icon" href="https://shuffleclick.com/beta/shuffle-icon-beta.png?v=9" />
  <link rel="apple-touch-icon" sizes="512x512" href="https://shuffleclick.com/beta/shuffle-icon-beta.png?v=9" />
  <link rel="icon" href="https://shuffleclick.com/beta/shuffle-icon-beta.png?v=9" />
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
'''
    _HTML_STANDALONE_SCRIPT = '''\
  <script>if (!navigator.standalone) document.documentElement.classList.add('browser-mode');</script>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, useRef, useCallback } = React;
'''
    _HTML_BOOTSTRAP = '''\
    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(<App />);
  </script>
  <p style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;">Randomise your exercises and keep time with Shuffle — a free tool that helps musicians practise more effectively. Set a range of exercises, choose a BPM, and let Shuffle run your session.</p>
  <script data-goatcounter="https://shuffle.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
'''
    _HTML_FOOT = '''\
</body>
</html>
'''
    parts = [_HTML_HEAD]
    with open(os.path.join(_SRC, 'styles.css'), 'r', encoding='utf-8') as f:
        css = f.read()
    parts.append('  <style>\n')
    parts.append(css)
    parts.append('  </style>\n')
    parts.append(_HTML_STANDALONE_SCRIPT)
    for rel_path in _SRC_FILES:
        with open(os.path.join(_SRC, rel_path), 'r', encoding='utf-8') as f:
            source = f.read()
        source = _transform(source)
        source = source.strip('\n')
        indented = _indent(source + '\n', spaces=4)
        parts.append('\n')
        parts.append(indented)
    parts.append('\n')
    parts.append(_HTML_BOOTSTRAP)
    parts.append(_HTML_FOOT)
    return ''.join(parts)

src = _build_source()

# Write beta/index.html (beta build — no watch patches, beta version string kept)
BETA_DEST = os.path.join(os.path.dirname(__file__), "beta", "index.html")
with open(BETA_DEST, "w", encoding="utf-8") as f:
    f.write(src)

# ── 1. Head patches ──────────────────────────────────────────────────────────

src = patch(src, "<title>Shuffle</title>", "<title>Shuffle Watch</title>")
src = patch(src, 
    '<meta name="apple-mobile-web-app-title" content="Shuffle" />',
    '<meta name="apple-mobile-web-app-title" content="Shuffle Watch" />'
)
src = patch(src, 
    '<meta property="og:title" content="Shuffle" />',
    '<meta property="og:title" content="Shuffle Watch" />'
)
src = re.sub(
    r'https://shuffleclick\.com/beta/shuffle-icon-beta\.png\?v=\d+',
    'https://shuffleclick.com/watch/shuffle-icon-watch.png',
    src
)

# ── 2. Firebase SDK scripts ──────────────────────────────────────────────────

firebase_scripts = (
    '  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>\n'
    '  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>'
)
src = patch(src, 
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
      font-family: var(--font-mono); font-size: 0.9rem; letter-spacing: 0.1em;
      text-transform: uppercase; color: #888; text-align: center; margin-top: -0.75rem;
    }
    .watch-btn-base {
      width: 100%; max-width: 380px; height: 56px; border-radius: 4px; border: none;
      font-family: var(--font-mono); font-size: 0.85rem; letter-spacing: 0.15em;
      text-transform: uppercase; cursor: pointer;
    }
    .watch-btn-base:active { opacity: 0.7; }
    .watch-btn { transition: opacity 0.1s; }
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
    .watch-connect-btn { background: #f5c842; color: #0f0f0f; }
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
    .share-code-box {
      background: #1a1a1a; border-radius: 12px; padding: 1.5rem 2.5rem;
      display: flex; flex-direction: column; align-items: center; gap: 0.6rem;
    }
    .share-session-label {
      font-family: var(--font-mono); font-size: 0.6rem; letter-spacing: 0.25em;
      text-transform: uppercase; color: #888; text-align: center;
    }
    .share-session-code {
      font-family: var(--font-mono); font-size: clamp(1.6rem, 6vw, 2.2rem);
      letter-spacing: 0.2em; color: #f5c842; text-shadow: 0 0 30px rgba(245,200,66,0.3);
      text-align: center;
    }
    .share-session-hint {
      font-family: var(--font-mono); font-size: 0.65rem; letter-spacing: 0.08em;
      color: #555; text-align: center; line-height: 1.7; max-width: 320px;
    }
    .sharing-indicator {
      width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
      cursor: pointer; flex-shrink: 0; background: none; border: none; padding: 0;
    }
    .sharing-indicator-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #f5c842;
      animation: sharing-pulse 2s ease-in-out infinite;
    }
    @keyframes sharing-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    /* Student controls: dimmed but readable while sharing */
    .control-group.watch-locked { opacity: 0.6; pointer-events: none; cursor: default; }
    /* Student minimal view when sharing */
    .watch-active .controls { display: none; }
    .watch-active .version-footer { display: none; }
    .watch-active .vol-wrap { display: none; }
    .watch-active .idle-summary { display: none; }
    .watch-active .exercise-number { font-size: clamp(7rem, 28vw, 12rem); }
    .watch-active .exercise-number.stopwatch-time { font-size: clamp(5.5rem, 22vw, 9rem); }
    .watch-active .countdown-display { font-size: clamp(7rem, 28vw, 12rem); }
    .watch-active .display { width: 100%; }
    .watch-active { padding-bottom: max(2.5rem, env(safe-area-inset-bottom)) !important; }
    .watch-student-status {
      display: flex; align-items: center;
      width: 100%; max-width: 440px;
      font-family: var(--font-mono); font-size: 0.6rem; letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .watch-student-status-item {
      flex: 1; display: flex; align-items: center; justify-content: center;
      padding: 0.35rem 0.3rem; color: #666; text-align: center; white-space: nowrap;
      border-left: 1px solid #2a2a2a;
    }
    .watch-student-status-item:first-child { border-left: none; }
    @media (max-width: 380px) {
      .watch-student-status { font-size: 0.52rem; }
    }
    @media (hover: none) and (pointer: coarse) and (min-width: 768px) and (min-height: 700px) {
      .watch-student-status { font-size: 0.75rem; max-width: 700px; }
    }
    @media (hover: hover) and (min-width: 1024px) {
      .watch-student-status { font-size: 0.8rem; max-width: 560px; }
    }
    @media (hover: hover) and (min-width: 1440px) {
      .watch-student-status { font-size: 0.9rem; max-width: 700px; }
    }
    .watch-audio-restore {
      position: fixed; bottom: max(5rem, calc(4rem + env(safe-area-inset-bottom))); left: 50%;
      transform: translateX(-50%);
      background: #1a1a1a; border: 1px solid #f5c842; border-radius: 8px;
      color: #f5c842; font-family: var(--font-mono); font-size: 0.7rem;
      letter-spacing: 0.08em; text-align: center; padding: 0.6rem 1.2rem;
      cursor: pointer; z-index: 50; white-space: nowrap;
      animation: watch-restore-pulse 2s ease-in-out infinite;
    }
    @keyframes watch-restore-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
    /* watch 1.12: enhanced student glanceable view */
    .watch-active .exercise-label { font-size: 1rem; letter-spacing: 0.2em; }
    .watch-active .next-exercise { font-size: clamp(1.8rem, 7vw, 2.8rem); }
    .watch-active .beat-dot { width: 14px; height: 14px; }
    .watch-active .beat-dots { gap: 0.9rem; }
    .watch-active .bar-block { height: 9px; border-radius: 3px; }
    .watch-active .bar-progress-track { height: 9px; border-radius: 3px; }
    .watch-active .bar-progress-fill { height: 9px; }
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
      user-select: none; -webkit-user-select: none;
    }
    .watching-code-text span { color: #f5c842; }
    .watching-disconnect-btn {
      background: none; border: 1px solid #333; border-radius: 4px; color: #888;
      font-family: var(--font-mono); font-size: 0.6rem; letter-spacing: 0.1em;
      text-transform: uppercase; padding: 0.3rem 0.6rem; cursor: pointer;
    }
    .watching-disconnect-btn:active { color: #ccc; border-color: #555; }
    .watching-banner { position: relative; }
    .watching-banner-right { display: flex; align-items: center; gap: 0.5rem; }
    .obs-menu-btn {
      background: none; border: none; color: #888;
      font-family: var(--font-body); font-size: 1.1rem; letter-spacing: 0;
      padding: 0; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; margin-top: -2px;
    }
    .obs-menu-btn:active { color: #aaa; }
    .obs-menu-panel {
      position: absolute; top: calc(100% + 0.4rem); right: 0;
      background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 4px;
      min-width: 200px; z-index: 50; overflow: hidden;
    }
    .obs-menu-item {
      display: block; width: 100%; padding: 0.65rem 0.85rem;
      background: none; border: none; border-bottom: 1px solid #222;
      color: #ccc; font-family: var(--font-mono); font-size: 0.65rem;
      letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; text-align: left;
    }
    .obs-menu-item:last-child { border-bottom: none; }
    .obs-menu-item:active { background: #222; }
    .obs-menu-item.active { color: #f5c842; }
    .obs-menu-item--destructive { color: #a04040; }
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
    .obs-toast {
      position: absolute; bottom: 0.5rem; left: 0; right: 0;
      text-align: center; font-family: var(--font-mono); font-size: 0.65rem; letter-spacing: 0.1em;
      color: #f5c842; pointer-events: none;
      animation: obsToastFade 1.8s ease forwards;
    }
    @keyframes obsToastFade {
      0%   { opacity: 1; }
      60%  { opacity: 1; }
      100% { opacity: 0; }
    }
    @media (hover: none) and (pointer: coarse) and (min-width: 768px) and (min-height: 700px) {
      .watching-banner { max-width: 700px; }
      .observer-info-strip { max-width: 700px; }
      .observer-app .display { max-width: 700px; }
    }
    /* Observer display layout */
    .observer-app .display { min-height: clamp(178px, 30dvh, 320px); }
    .observer-app .display { max-width: 440px; }
    .observer-app .bpm-tap { user-select: none; }
    .observer-app .bpm-tap * { user-select: none; }
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
    @media (hover: hover) and (min-width: 1024px) {
      .watching-banner    { max-width: 560px; }
      .observer-info-strip { max-width: 560px; }
      .observer-app .display { max-width: 560px; }
      .observer-app .btn-row { max-width: 560px; }
      .observer-controls  { max-width: 560px; }
      .observer-divider   { max-width: 560px; }
    }
    @media (hover: hover) and (min-width: 1440px) {
      .watching-banner    { max-width: 700px; }
      .observer-info-strip { max-width: 700px; }
      .observer-app .display { max-width: 700px; }
      .observer-app .btn-row { max-width: 700px; }
      .observer-controls  { max-width: 700px; }
      .observer-divider   { max-width: 700px; }
    }
"""
src = patch(src, "  </style>", watch_css + "  </style>")

# ── 3b. Student controls: lock when watchScreen === "app" ────────────────────
# The watch layer injects watchScreen into App scope. We patch the student
# controls to add watch-locked class (opacity 0.6, pointer-events none) without
# adding disabled attributes — disabled causes its own opacity: 0.25 override.

# handleTap guard
src = patch(src,
    "      const handleTap = useCallback(() => {\n        if (running) return;",
    "      const handleTap = useCallback(() => {\n        if (running || watchScreen === \"app\") return;"
)

# incBpm / decBpm guards
src = patch(src,
    "      const incBpm  = useCallback(() => setBpm(b => clampBpm(b + 1)), []);\n"
    "      const decBpm  = useCallback(() => setBpm(b => clampBpm(b - 1)), []);",
    "      const incBpm  = useCallback(() => { if (watchScreen === \"app\") return; setBpm(b => clampBpm(b + 1)); }, [watchScreen]);\n"
    "      const decBpm  = useCallback(() => { if (watchScreen === \"app\") return; setBpm(b => clampBpm(b - 1)); }, [watchScreen]);"
)

# incBars / decBars guards
src = patch(src,
    "      const incBars   = useCallback(() => { if (!running) setBarsPerExercise(b => Math.min(BARS_MAX, b + 1)); }, [running]);\n"
    "      const decBars   = useCallback(() => { if (!running) setBarsPerExercise(b => Math.max(BARS_MIN, b - 1)); }, [running]);",
    "      const incBars   = useCallback(() => { if (!running && watchScreen !== \"app\") setBarsPerExercise(b => Math.min(BARS_MAX, b + 1)); }, [running, watchScreen]);\n"
    "      const decBars   = useCallback(() => { if (!running && watchScreen !== \"app\") setBarsPerExercise(b => Math.max(BARS_MIN, b - 1)); }, [running, watchScreen]);"
)

# Mode control group
src = patch(src, 
    '              <div className={`control-group full-width${running ? " dimmed" : ""}`}>',
    '              <div className={`control-group full-width${watchScreen === "app" ? " watch-locked" : running ? " dimmed" : ""}`}>'
)

# Mode buttons: no disabled for watchScreen (pointer-events: none on parent handles it)
# (leave disabled={running} as-is; the watch-locked class already blocks interaction)

# BPM control group (inside bpm-timesig-row > bpm-group)
src = patch(src,
    '                <div className="control-group bpm-group">\n                  <label>BPM</label>\n                  <div className="bpm-widget-row">\n                    <div className="bpm-widget">\n'
    '                      <button className="bpm-btn left" {...bpmDecHandlers}>−</button>\n'
    '                      <div className={`bpm-tap${tapped ? " tapped" : ""}`}\n'
    '                        onClick={!running ? handleTap : undefined}\n'
    '                        onMouseDown={e => e.preventDefault()}\n'
    '                        style={running ? { cursor: "default", pointerEvents: "none" } : {}}>\n'
    '                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>\n'
    '                          <span>{bpm}</span>\n'
    '                          {!running && <span className="bpm-tap-label">tap to set</span>}\n'
    '                        </div>\n'
    '                      </div>\n'
    '                      <button className="bpm-btn right" {...bpmIncHandlers}>+</button>',
    '                <div className={`control-group bpm-group${watchScreen === "app" ? " watch-locked" : ""}`}>\n                  <label>BPM</label>\n                  <div className="bpm-widget-row">\n                    <div className="bpm-widget">\n'
    '                      <button className="bpm-btn left" {...bpmDecHandlers}>−</button>\n'
    '                      <div className={`bpm-tap${tapped ? " tapped" : ""}`}\n'
    '                        onClick={!running && watchScreen !== "app" ? handleTap : undefined}\n'
    '                        onMouseDown={e => e.preventDefault()}\n'
    '                        style={running || watchScreen === "app" ? { cursor: "default", pointerEvents: "none" } : {}}>\n'
    '                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>\n'
    '                          <span>{bpm}</span>\n'
    '                          {!running && watchScreen !== "app" && <span className="bpm-tap-label">tap to set</span>}\n'
    '                        </div>\n'
    '                      </div>\n'
    '                      <button className="bpm-btn right" {...bpmIncHandlers}>+</button>'
)

# Time signature control group (inside bpm-timesig-row, has timesig-group class)
src = patch(src,
    '                <div className={`control-group timesig-group${running ? " dimmed" : ""}`}>\n                  <label>Time signature</label>',
    '                <div className={`control-group timesig-group${watchScreen === "app" ? " watch-locked" : running ? " dimmed" : ""}`}>\n                  <label>Time signature</label>'
)

# Count in control group
src = patch(src,
    '              <div className={`control-group${running ? " dimmed" : ""}`}>\n                <label>Count in</label>',
    '              <div className={`control-group${watchScreen === "app" ? " watch-locked" : running ? " dimmed" : ""}`}>\n                <label>Count in</label>'
)

# Exercise length control group
src = patch(src,
    '                <div className={`control-group${running || exMode === \'pick\' ? " dimmed" : ""}`}>\n                  <label>Exercise length</label>',
    '                <div className={`control-group${watchScreen === "app" ? " watch-locked" : running || exMode === \'pick\' ? " dimmed" : ""}`}>\n                  <label>Exercise length</label>'
)

# Exercises control group
src = patch(src,
    '                <div className={`control-group${running ? " dimmed" : ""}`}>\n                  <label>Exercises</label>',
    '                <div className={`control-group${watchScreen === "app" ? " watch-locked" : running ? " dimmed" : ""}`}>\n                  <label>Exercises</label>'
)

# Rounds Per Exercise control group
src = patch(src,
    '                <div className={`control-group${running ? " dimmed" : ""}`}>\n                  <label>Rounds Per Exercise</label>',
    '                <div className={`control-group${watchScreen === "app" ? " watch-locked" : running ? " dimmed" : ""}`}>\n                  <label>Rounds Per Exercise</label>'
)

# Settings menu: replace with sharing indicator when student is sharing
src = patch(src, 
    '            <div className="settings-menu-wrap app-header-spacer">',
    '            {watchScreen === "app"\n'
    '              ? <div className="sharing-indicator" onClick={() => setWatchScreen("share")} title="Sharing">\n'
    '                  <div className="sharing-indicator-dot" style={{ animationDuration: `${Math.round(120000 / bpm)}ms` }} />\n'
    '                </div>\n'
    '              : <div className="settings-menu-wrap app-header-spacer">',
    1
)
# Close the conditional after the closing </div> of the settings-menu-wrap
src = patch(src, 
    '            </div>\n'
    '          </div>\n'
    '          <div className="app-subtitle">',
    '            </div>}\n'
    '          </div>\n'
    '          <div className="app-subtitle">',
    1
)

# Stop button: hide from student when sharing (teacher controls Stop)
src = patch(src, 
    '                <div className="btn-group-stop">',
    '                <div className="btn-group-stop" style={watchScreen === "app" ? { display: "none" } : {}}>'
)

# Stopwatch display: stopwatch-time class is applied via exercise-number in source — no patch needed

# Paused state: make "paused" text amber in watch student view (inline color overrides CSS class)
src = patch(src,
    '<span className="status-label">paused</span>',
    '<span className="status-label" style={{ color: watchScreen === "app" ? "#f5c842" : undefined }}>paused</span>'
)

# Status bar: segmented pill below display, matching its width
src = patch(src, 
    '          <div className="btn-row">',
    '          {watchScreen === "app" && audioRestoreNeeded && (\n'
    '            <div className="watch-audio-restore" onClick={() => {\n'
    '              try { const ctx = getCtx(); ctx.resume().then(() => { if (ctx.state === "running") setAudioRestoreNeeded(false); }); } catch(e) {}\n'
    '            }}>Tap to restore audio</div>\n'
    '          )}\n'
    '          {watchScreen === "app" && (\n'
    '            <div className="watch-student-status">\n'
    '              <div className="watch-student-status-item">{bpm} BPM</div>\n'
    '              <div className="watch-student-status-item">{countInBars}-bar count in</div>\n'
    '              <div className="watch-student-status-item">\n'
    '                {exMode === "pick"\n'
    '                  ? (pickedNums.length === 0 ? "no ex" : pickedNums.length > 4 ? `${pickedNums.length} ex` : `ex ${pickedNums.map(n => letterMode ? numToLetter(n) : String(n)).join(", ")}`)\n'
    '                  : `ex ${letterMode ? numToLetter(minEx) : String(minEx)}\u2013${letterMode ? numToLetter(maxEx) : String(maxEx)}`}\n'
    '              </div>\n'
    '              <div className="watch-student-status-item">{barsPerExercise} round{barsPerExercise !== 1 ? "s" : ""}</div>\n'
    '              <div className="watch-student-status-item">\n'
    '                {mode === MODE_FULLSET ? "Shuffle" : mode === MODE_SEQUENTIAL ? "Sequence" : "Metronome"}{infinite ? " \u221e" : ""}{mode === MODE_CLICKONLY && stopwatch ? " \u23F1\uFE0E" : ""}\n'
    '              </div>\n'
    '            </div>\n'
    '          )}\n'
    '          <div className="btn-row">',
    1
)

# Letter mode popup: suppress entirely in watch build
src = patch(src, 
    "        if (!letterModeSeenRef.current) {\n"
    "          letterModeSeenRef.current = true;\n"
    "          localStorage.setItem('shuffle_lm_seen', '1');\n"
    "          setShowLetterModePopup(true);\n"
    "        }",
    "        /* letter mode popup suppressed in watch build */"
)

# Mute hint: suppress when sharing
src = patch(src,
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
        mode: obsMode, infinite: obsInfinite, stopwatch: obsStopwatch, infiniteByMode: obsInfiniteByMode, stopwatchPref: obsStopwatchPref, elapsedSeconds: obsElapsed, bpm: obsBpm, timeSig: obsTimeSigLabel,
        barsPerExercise: obsBpe, exerciseLength: obsExLen,
        countInBars: obsCib, countInEvery: obsCountInEvery,
        looping: obsLooping, letterMode: obsLm,
        minEx: obsMinEx, maxEx: obsMaxEx,
        pickedNums: obsPickedNums, exMode: obsExMode,
        subdivision: obsSubdivision, beatStates: obsBeatStates, subdivVol: obsSubdivVol, subdivVol2: obsSubdivVol2,
        volume: obsVolume,
        bpmAuto: obsBpmAuto, bpmAutoStep: obsBpmAutoStep, bpmAutoDir: obsBpmAutoDir,
        bpmAutoTrigger: obsBpmAutoTrigger, bpmAutoBarInterval: obsBpmAutoBarInterval,
        bpmAutoSecInterval: obsBpmAutoSecInterval, bpmAutoRandom: obsBpmAutoRandom,
        isFirstExOfSet: obsIsFirstExOfSet, setCount: obsSetCount,
        disconnected,
      } = state || {};

      const [openSelector, setOpenSelector] = React.useState(null);
      const [pickerOpen, setPickerOpen] = React.useState(false);
      const [numpadOpen, setNumpadOpen] = React.useState(null);
      const tapTimesObs = React.useRef([]);
      const [tapped, setTapped] = React.useState(false);
      const [letterModeOverride, setLetterModeOverride] = React.useState(null);
      const effectiveLm = letterModeOverride !== null ? letterModeOverride : !!obsLm;
      const [toastMsg, setToastMsg] = React.useState(null);
      const [toastKey, setToastKey] = React.useState(0);
      const toastTimer = React.useRef(null);
      const [menuOpen, setMenuOpen] = React.useState(false);
      const [showObsVolume, setShowObsVolume] = React.useState(false);
      const showToast = (msg) => {
        setToastMsg(msg);
        setToastKey(k => k + 1);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastMsg(null), 1800);
      };

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

      // BPM Automation local state (mirrors main app — teacher controls the student's BPM)
      const isObsMetronome = obsMode === "clickonly";
      const obsInfiniteEff = !!obsInfinite;
      const [obsBpmAutoOpen,      setObsBpmAutoOpen]      = React.useState(false);
      const [localBpmAuto,        setLocalBpmAuto]        = React.useState(() => !!obsBpmAuto);
      const [localBpmAutoStep,    setLocalBpmAutoStep]    = React.useState(() => obsBpmAutoStep ?? 2);
      const [localBpmAutoDir,     setLocalBpmAutoDir]     = React.useState(() => obsBpmAutoDir ?? 'up');
      const [localBpmAutoTrigger, setLocalBpmAutoTrigger] = React.useState(() => obsBpmAutoTrigger ?? 'set');
      const [localBpmAutoBarInterval, setLocalBpmAutoBarInterval] = React.useState(() => obsBpmAutoBarInterval ?? 8);
      const [localBpmAutoSecInterval, setLocalBpmAutoSecInterval] = React.useState(() => obsBpmAutoSecInterval ?? 30);
      const [localBpmAutoRandom,  setLocalBpmAutoRandom]  = React.useState(() => !!obsBpmAutoRandom);
      const [localBpmAutoMin,     setLocalBpmAutoMin]     = React.useState(() => obsBpm || 80);
      const [localBpmAutoMax,     setLocalBpmAutoMax]     = React.useState(() => obsBpm || 80);
      const bpmGearBtnRef = React.useRef(null);

      // Sync local bpmAuto state when student state changes (e.g. on connect)
      React.useEffect(() => {
        setLocalBpmAuto(!!obsBpmAuto);
        setLocalBpmAutoStep(obsBpmAutoStep ?? 2);
        setLocalBpmAutoDir(obsBpmAutoDir ?? 'up');
        setLocalBpmAutoTrigger(obsBpmAutoTrigger ?? 'set');
        setLocalBpmAutoBarInterval(obsBpmAutoBarInterval ?? 8);
        setLocalBpmAutoSecInterval(obsBpmAutoSecInterval ?? 30);
        setLocalBpmAutoRandom(!!obsBpmAutoRandom);
      }, [obsBpmAuto, obsBpmAutoStep, obsBpmAutoDir, obsBpmAutoTrigger, obsBpmAutoBarInterval, obsBpmAutoSecInterval, obsBpmAutoRandom]);

      const obsAutoBarCountRef = React.useRef(0);
      const obsAutoTimerRef = React.useRef(null);

      const applyObsBpmStep = React.useCallback(() => {
        if (localBpmAutoRandom && !isObsMetronome) {
          const lo = Math.min(localBpmAutoMin, localBpmAutoMax);
          const hi = Math.max(localBpmAutoMin, localBpmAutoMax);
          onSendCmd({ bpm: Math.floor(Math.random() * (hi - lo + 1)) + lo });
        } else {
          const delta = localBpmAutoDir === 'up' ? localBpmAutoStep : -localBpmAutoStep;
          const newBpm = Math.min(300, Math.max(30, (obsBpmRef.current || 80) + delta));
          onSendCmd({ bpm: newBpm });
        }
      }, [localBpmAutoRandom, isObsMetronome, localBpmAutoMin, localBpmAutoMax, localBpmAutoDir, localBpmAutoStep, onSendCmd]);

      // Metronome bar-count BPM automation (teacher side)
      React.useEffect(() => {
        if (!localBpmAuto || obsMode !== "clickonly" || phase !== "playing" || obsPaused) return;
        if (localBpmAutoTrigger !== "bars" && localBpmAutoTrigger !== "set") return;
        obsAutoBarCountRef.current += 1;
        if (obsAutoBarCountRef.current >= localBpmAutoBarInterval) {
          obsAutoBarCountRef.current = 0;
          applyObsBpmStep();
        }
      }, [exercise]);

      // Metronome time-based BPM automation (teacher side)
      React.useEffect(() => {
        if (!localBpmAuto || obsMode !== "clickonly" || phase !== "playing" || obsPaused || localBpmAutoTrigger !== "seconds") {
          clearInterval(obsAutoTimerRef.current); obsAutoTimerRef.current = null;
          return;
        }
        const intervalMs = Math.max(1, localBpmAutoSecInterval) * 1000;
        obsAutoTimerRef.current = setInterval(applyObsBpmStep, intervalMs);
        return () => { clearInterval(obsAutoTimerRef.current); obsAutoTimerRef.current = null; };
      }, [localBpmAuto, obsMode, phase, obsPaused, localBpmAutoTrigger, localBpmAutoSecInterval, applyObsBpmStep]);

      React.useEffect(() => { obsAutoBarCountRef.current = 0; }, [localBpmAutoTrigger]);

      const beatsPerBar = parseInt(obsTimeSigLabel) || 4;
      const exLen = obsExLen || 1;
      const bpe = obsBpe || 4;
      const currentRound = Math.floor((currentBar || 0) / exLen) + 1;
      const isCountIn = phase === "countin";
      const isPlaying = phase === "playing";
      const isIdle = !obsRunning && !obsPaused;
      const disabled = !!disconnected;
      const subdivision = obsSubdivision || 1;
      const beatStates = Array.isArray(obsBeatStates) ? obsBeatStates : Array.from({ length: beatsPerBar }, (_, i) => i === 0 ? 'accent' : 'normal');

      const cycleBeatStateObs = React.useCallback((i) => {
        if (disabled || obsMode !== "clickonly") return;
        const order = ['accent', 'normal', 'silent'];
        const next = [...beatStates];
        next[i] = order[(order.indexOf(beatStates[i]) + 1) % 3];
        onSendCmd({ beatStates: next });
      }, [disabled, obsMode, beatStates, onSendCmd]);
      const obsTimeSig = TIME_SIGS.find(t => t.label === obsTimeSigLabel) || TIME_SIGS[2];
      const exMode = obsExMode || "range";
      const pickedNums = obsPickedNums || [];
      const validRange = obsMode === "clickonly" ? true
        : exMode === "pick" ? pickedNums.length >= 1
        : (obsMinEx || 1) <= (obsMaxEx || 1);

      const modeLabel = ({ fullset: "Shuffle", sequential: "Sequence", clickonly: "Metronome" }[obsMode] || obsMode) + (obsInfinite && obsMode !== "clickonly" ? " ∞" : "");

      const buildSettingsSummary = () => {
        let parts = [];
        if (obsMode !== "clickonly") {
          if (exMode === "pick") {
            if (pickedNums.length === 0) parts.push("no exercises");
            else parts.push(...pickedNums.map(n => effectiveLm ? numToLetter(n) : String(n)));
          } else {
            const lo = effectiveLm ? numToLetter(obsMinEx || 1) : String(obsMinEx || 1);
            const hi = effectiveLm ? numToLetter(obsMaxEx || 1) : String(obsMaxEx || 1);
            parts.push(`${lo}\u2013${hi}`);
          }
          const rds = obsBpe || 1;
          parts.push(`${rds} round${rds !== 1 ? "s" : ""}`);
        }
        const cib = obsCib || 1;
        parts.push(`${cib}-bar count in${obsCountInEvery && obsMode !== "clickonly" ? " every exercise" : ""}`);
        parts.push(modeLabel);
        return parts.join(", ");
      };

      const buildShareUrl = () => {
        const p = new URLSearchParams();
        if (obsBpm)           p.set("bpm",    String(obsBpm));
        if (obsTimeSigLabel)  p.set("sig",    obsTimeSigLabel);
        if (obsExLen)         p.set("exlen",  String(obsExLen));
        if (obsMinEx != null) p.set("min",    String(obsMinEx));
        if (obsMaxEx != null) p.set("max",    String(obsMaxEx));
        if (obsCib)           p.set("cib",    String(obsCib));
        if (obsCountInEvery)  p.set("cie",    "1");
        if (obsMode)          p.set("mode",   obsMode);
        if (obsInfinite && obsMode !== "clickonly") p.set("inf", "1");
        if (obsBpe)           p.set("rounds", String(obsBpe));
        if (obsExMode && obsExMode !== "range") p.set("exmode", obsExMode);
        if (obsExMode === "pick" && pickedNums.length > 0) p.set("picks", pickedNums.join(","));
        if (effectiveLm)      p.set("lm",     "1");
        return "https://shuffleclick.com/?" + p.toString();
      };

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
            <div className="watching-banner-right">
              <span className="watching-code-text">watching <span>{code}</span></span>
              <button className="watching-disconnect-btn" onClick={() => { onSendCmd({ tcmd: "end-session", tseq: Date.now() }); _db.ref("sessions/" + code).remove(); onDisconnect(); }}>End session</button>
            </div>
            <button className={`obs-menu-btn${menuOpen ? " open" : ""}`}
              onClick={() => setMenuOpen(v => !v)}>☰</button>
            {menuOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 49 }}
                     onClick={() => setMenuOpen(false)} />
                <div className="obs-menu-panel">
                  <button className="obs-menu-item" onClick={() => {
                    setMenuOpen(false);
                    navigator.clipboard.writeText(buildSettingsSummary())
                      .then(() => showToast("Copied!"))
                      .catch(() => showToast("Copy failed"));
                  }}>Copy summary</button>
                  <button className="obs-menu-item" onClick={() => {
                    setMenuOpen(false);
                    const next = !effectiveLm;
                    setLetterModeOverride(next);
                    onSendCmd({ letterMode: next });
                    showToast(next ? "Letter mode on" : "Letter mode off");
                  }}>{effectiveLm ? "Turn letter mode off" : "Turn letter mode on"}</button>
                  <button className="obs-menu-item" onClick={() => {
                    setMenuOpen(false);
                    navigator.clipboard.writeText(buildShareUrl())
                      .then(() => showToast("Link copied!"))
                      .catch(() => showToast("Copy failed"));
                  }}>Share link</button>
                  <button className="obs-menu-item obs-menu-item--destructive" onClick={() => {
                    setMenuOpen(false);
                    onSendCmd({ tcmd: "stop", tseq: Date.now(),
                      bpm: 80, timeSig: "4/4", barsPerExercise: 4, exerciseLength: 1,
                      minEx: 1, maxEx: 4, countInBars: 1, countInEvery: true,
                      mode: "fullset", infinite: false, stopwatch: false, resetAll: true, exMode: "range", pickedNums: [], letterMode: false,
                      volume: 1.0, subdivVol: 0.7, subdivVol2: 0.7 });
                    setLetterModeOverride(false);
                    showToast("Settings reset");
                  }}>Reset to defaults</button>
                </div>
              </>
            )}
          </div>

          {disconnected && <div className="observer-offline">Session ended</div>}

          <div className={`display${obsMode === "clickonly" ? " display--metro" : ""}`}>
            <div key={`${phase}-${obsIsFirstExOfSet}-${obsSetCount}`} className={`exercise-label${obsIsFirstExOfSet && isPlaying && obsMode !== "clickonly" ? " exercise-label--set" : ""}`}>
              {isCountIn ? "count in" : sc ? "\u00A0" : isIdle ? "ready" : obsMode === "clickonly" ? (obsStopwatch ? "time" : "bar") : obsIsFirstExOfSet && isPlaying ? `set ${obsSetCount}` : "exercise"}
            </div>

            {isCountIn ? (
              <div className="countdown-display">
                {countInBeat > 0 ? (((countInBeat - 1) % beatsPerBar) + 1 < 10 ? "0" : "") + (((countInBeat - 1) % beatsPerBar) + 1) : "--"}
              </div>
            ) : sc ? (
              <div className="exercise-number done">done</div>
            ) : (
              <div className={`exercise-number${isIdle ? " idle" : ""}`}>
                {obsMode === "clickonly" && obsStopwatch && phase !== "idle"
                  ? `${Math.floor((obsElapsed || 0) / 60)}:${String((obsElapsed || 0) % 60).padStart(2, "0")}`
                  : exercise != null ? (effectiveLm ? String.fromCharCode(64 + exercise) : (exercise < 10 ? "0" + exercise : "" + exercise)) : "--"}
              </div>
            )}

            {!sc && (
              isIdle ? (
                sc ? <div className="idle-summary">&nbsp;</div>
                : obsMode === "clickonly" ? null : (
                  <div className="idle-summary" style={{ userSelect: "none", WebkitUserSelect: "none" }}>
                    {exMode === "pick"
                      ? `${pickedNums.length === 0 ? "no bars" : pickedNums.length > 4 ? `${pickedNums.length} exercises` : pickedNums.map(n => effectiveLm ? numToLetter(n) : String(n)).join(", ")} · ${obsBpe || "--"} round${obsBpe !== 1 ? "s" : ""} · ${(obsMode === "fullset" ? "shuffle" : obsMode === "sequential" ? "sequence" : obsMode || "--") + (obsInfinite && obsMode !== "clickonly" ? " ∞" : "")}`
                      : `${effectiveLm ? numToLetter(obsMinEx || 1) : String(obsMinEx || 1)}–${effectiveLm ? numToLetter(obsMaxEx || 1) : String(obsMaxEx || 1)} · ${obsExLen || "--"}-bar ex · ${obsBpe || "--"} round${obsBpe !== 1 ? "s" : ""} · ${(obsMode === "fullset" ? "shuffle" : obsMode === "sequential" ? "sequence" : obsMode || "--") + (obsInfinite && obsMode !== "clickonly" ? " ∞" : "")}`}
                  </div>
                )
              ) : (
                <div className="next-exercise">
                  {obsPaused
                    ? <span className="status-label">paused</span>
                    : obsResuming
                      ? obsMode === "clickonly"
                        ? <span className="status-label">resuming</span>
                        : <><span className="next-label">resuming</span>{exercise != null ? (effectiveLm ? String.fromCharCode(64 + exercise) : (exercise < 10 ? "0" + exercise : "" + exercise)) : "--"}</>
                      : obsLooping
                        ? <span className="status-label status-label--dim">looping</span>
                        : nextEx === -1 && phase === "playing"
                          ? <span className="status-label status-label--dim">last exercise</span>
                          : nextEx != null && (phase === "playing" || phase === "countin")
                            ? <><span className="next-label">up next</span>{effectiveLm ? String.fromCharCode(64 + (nextEx === -1 ? exercise : nextEx)) : ((nextEx === -1 ? exercise : nextEx) < 10 ? "0" + (nextEx === -1 ? exercise : nextEx) : "" + (nextEx === -1 ? exercise : nextEx))}</>
                            : "\u00A0"}
                </div>
              )
            )}

            {!sc && (
              <div className={`beat-dots${obsMode === "clickonly" ? " tappable" : ""}`}>
                {Array.from({ length: beatsPerBar }).map((_, i) => {
                  const bState = obsMode === "clickonly" ? (beatStates[i] ?? 'normal') : null;
                  const isActive = isPlaying && !obsPaused && (currentBeat || 0) === i;
                  return (
                    <div key={i}
                      className={[
                        'beat-dot',
                        isIdle && obsMode !== 'clickonly' ? 'inactive' : '',
                        i === 0 ? 'beat1' : '',
                        isActive ? 'active' : '',
                        bState ? bState : '',
                      ].filter(Boolean).join(' ')}
                      onClick={obsMode === "clickonly" ? () => cycleBeatStateObs(i) : undefined}
                    />
                  );
                })}
              </div>
            )}

            {!sc && obsMode === "clickonly" && subdivision > 1 && (
              <div className="subdiv-dots">
                {Array.from({ length: beatsPerBar * subdivision }).map((_, i) => {
                  const beatIndex = Math.floor(i / subdivision);
                  const subIndex = i % subdivision;
                  const isActive = isPlaying && !obsPaused && (currentBeat || 0) === beatIndex && subIndex === 0;
                  const isBeat = subIndex === 0;
                  return (
                    <div key={i} className={`subdiv-dot${isBeat ? ' beat' : ''}${isActive ? ' active' : ''}`} />
                  );
                })}
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
            {toastMsg && <div key={toastKey} className="obs-toast">{toastMsg}</div>}
          </div>


          <div className="observer-controls">
            <div className="section-grid controls-grid">

              <div className={`control-group full-width${obsRunning ? " dimmed" : ""}`}>
                <label>Mode</label>
                <div className="selector-row">
                  {[
                    { label: "Shuffle",   value: "fullset" },
                    { label: "Sequence",  value: "sequential" },
                    { label: "Metronome", value: "clickonly" },
                  ].map(m => (
                    <button key={m.value}
                      className={`sel-btn${obsMode === m.value ? " active" : ""}`}
                      onClick={() => {
                        if (m.value === obsMode && m.value === "clickonly") {
                          onSendCmd({ stopwatch: !obsStopwatch });
                        } else if (m.value === obsMode && (m.value === "fullset" || m.value === "sequential")) {
                          onSendCmd({ infinite: !obsInfinite });
                        } else {
                          onSendCmd({ mode: m.value });
                        }
                      }} disabled={disabled || obsRunning}>
                      {m.label}{((m.value === obsMode ? obsInfinite : (obsInfiniteByMode || {})[m.value]) && (m.value === "fullset" || m.value === "sequential")) ? " ∞" : ""}{(m.value === obsMode ? obsStopwatch : (m.value === "clickonly" ? obsStopwatchPref : false)) && m.value === "clickonly" ? " \u23F1\uFE0E" : ""}
                    </button>
                  ))}
                </div>
              </div>

              <div className="control-group">
                <label>BPM</label>
                <div className="bpm-widget-row">
                  <div className="bpm-widget">
                    <button className="bpm-btn left" disabled={disabled} {...bpmObsDecHandlers}>−</button>
                    <div className={`bpm-tap${tapped ? " tapped" : ""}`}
                      onClick={!disabled && !obsRunning ? handleTapBpm : undefined}
                      onMouseDown={e => e.preventDefault()}
                      style={(disabled || obsRunning) ? { cursor: "default", pointerEvents: "none" } : {}}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                        <span>{obsBpm || "--"}</span>
                        {!disabled && !obsRunning && <span className="bpm-tap-label">tap to set</span>}
                      </div>
                    </div>
                    <button className="bpm-btn right" disabled={disabled} {...bpmObsIncHandlers}>+</button>
                  </div>
                  {(obsMode === "clickonly" || obsInfiniteEff) && (
                    <button
                      ref={bpmGearBtnRef}
                      className={`bpm-gear-btn${localBpmAuto ? " active" : ""}`}
                      onClick={() => setObsBpmAutoOpen(v => !v)}
                      title="BPM automation"
                    >⚙&#xFE0E;</button>
                  )}
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

              {obsMode === "clickonly" && (
                <div className="control-group subdiv-group">
                  <label>Subdivision</label>
                  <div className="selector-row">
                    <button className={`sel-btn subdiv-btn${subdivision === 1 ? " active" : ""}`}
                      disabled={disabled} onClick={() => onSendCmd({ subdivision: 1 })}>
                      <svg viewBox="0 0 16 36" className="subdiv-svg">
                        <ellipse cx="8" cy="30" rx="5" ry="3.2" transform="rotate(-18,8,30)" fill="currentColor"/>
                        <line x1="12.5" y1="28" x2="12.5" y2="4" stroke="currentColor" strokeWidth="1.5"/>
                      </svg>
                    </button>
                    <button className={`sel-btn subdiv-btn${subdivision === 2 ? " active" : ""}`}
                      disabled={disabled} onClick={() => onSendCmd({ subdivision: 2 })}>
                      <svg viewBox="0 0 30 36" className="subdiv-svg">
                        <ellipse cx="6"  cy="30" rx="5" ry="3.2" transform="rotate(-18,6,30)"  fill="currentColor"/>
                        <ellipse cx="21" cy="30" rx="5" ry="3.2" transform="rotate(-18,21,30)" fill="currentColor"/>
                        <line x1="10.5" y1="27.5" x2="10.5" y2="4" stroke="currentColor" strokeWidth="1.5"/>
                        <line x1="25.5" y1="27.5" x2="25.5" y2="4" stroke="currentColor" strokeWidth="1.5"/>
                        <line x1="10.5" y1="4"    x2="25.5" y2="4" stroke="currentColor" strokeWidth="2.5"/>
                      </svg>
                    </button>
                    <button className={`sel-btn subdiv-btn${subdivision === 3 ? " active" : ""}`}
                      disabled={disabled} onClick={() => onSendCmd({ subdivision: 3 })}>
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
                    </button>
                    <button className={`sel-btn subdiv-btn${subdivision === 4 ? " active" : ""}`}
                      disabled={disabled} onClick={() => onSendCmd({ subdivision: 4 })}>
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
                    </button>
                  </div>
                </div>
              )}

              {obsMode !== "clickonly" && (
                <div className={`control-group${obsRunning || exMode === "pick" ? " dimmed" : ""}`}>
                  <label>Exercise length</label>
                  <CompactSelector
                    id="obs-exLength"
                    value={obsExLen || 1}
                    options={[1, 2, 4]}
                    onChange={n => onSendCmd({ exerciseLength: n })}
                    disabled={disabled || obsRunning || exMode === "pick"}
                    openSelector={openSelector}
                    setOpenSelector={setOpenSelector}
                    getLabel={n => n === 1 ? "1 bar" : n + " bars"}
                  />
                </div>
              )}

              {obsMode !== "clickonly" && (
                <div className={`control-group${obsRunning ? " dimmed" : ""}`}>
                  <label>Exercises</label>
                  <div className="ex-control-row">
                    {exMode !== "pick" ? (
                      <div className="range-row">
                        <input type="text" readOnly
                          value={effectiveLm ? String.fromCharCode(64 + (obsMinEx || 1)) : (obsMinEx != null ? String(obsMinEx) : "--")}
                          disabled={disabled || obsRunning}
                          onPointerDown={e => { e.preventDefault(); if (!disabled && !obsRunning) setNumpadOpen("min"); }}
                          style={{ cursor: disabled || obsRunning ? "default" : "pointer" }} />
                        <span>to</span>
                        <input type="text" readOnly
                          value={effectiveLm ? String.fromCharCode(64 + (obsMaxEx || 1)) : (obsMaxEx != null ? String(obsMaxEx) : "--")}
                          disabled={disabled || obsRunning}
                          onPointerDown={e => { e.preventDefault(); if (!disabled && !obsRunning) setNumpadOpen("max"); }}
                          style={{ cursor: disabled || obsRunning ? "default" : "pointer" }} />
                      </div>
                    ) : (
                      <button
                        className={"pick-trigger-btn" + (pickedNums.length === 0 ? " empty" : "") + (pickedNums.length === 0 && !obsRunning ? " invalid" : "")}
                        disabled={disabled || obsRunning}
                        onClick={() => setPickerOpen(true)}>
                        {pickedNums.length === 0 ? "Tap to select..." : pickedNums.map(n => effectiveLm ? String.fromCharCode(64 + n) : (n < 10 ? "0" + n : "" + n)).join(", ")}
                      </button>
                    )}
                    <div className="ex-mode-toggle">
                      <button className={"ex-mode-btn" + (exMode !== "pick" ? " active" : "")}
                        disabled={disabled || obsRunning}
                        onClick={() => onSendCmd({ exMode: "range" })}>Range</button>
                      <button className={"ex-mode-btn" + (exMode === "pick" ? " active" : "")}
                        disabled={disabled || obsRunning}
                        onClick={() => onSendCmd({ exMode: "pick", exerciseLength: 1 })}>Pick</button>
                    </div>
                  </div>
                </div>
              )}

              {obsMode !== "clickonly" && (
                <div className={`control-group${obsRunning ? " dimmed" : ""}`}>
                  <label>Rounds Per Exercise</label>
                  <div className="stepper">
                    <button className="stepper-btn left" disabled={disabled || obsRunning}
                      onClick={() => onSendCmd({ barsPerExercise: Math.max(1, (obsBpe || 4) - 1) })}>−</button>
                    <div className="stepper-val" style={obsRunning ? { opacity: 0.25 } : {}}>{obsBpe || "--"}</div>
                    <button className="stepper-btn right" disabled={disabled || obsRunning}
                      onClick={() => onSendCmd({ barsPerExercise: Math.min(32, (obsBpe || 4) + 1) })}>+</button>
                  </div>
                </div>
              )}

            </div>
          </div>

          <div className="btn-row" style={{ width: "100%" }}>
            {!obsRunning ? (
              <button className="action-btn" disabled={disabled || !validRange}
                onClick={() => onSendCmd({ tcmd: "start", tseq: Date.now() })}>Start</button>
            ) : obsMode === "clickonly" ? (
              <button className="action-btn stop" disabled={disabled}
                onClick={() => onSendCmd({ tcmd: "stop", tseq: Date.now() })}>Stop</button>
            ) : (
              <>
                <div className="btn-group">
                  <button className={`action-btn${obsPaused ? " pause-active" : " secondary"}`} disabled={disabled}
                    onClick={() => onSendCmd({ tcmd: obsPaused ? "resume" : "pause", tseq: Date.now() })}>
                    {obsPaused ? "Resume" : "Pause"}
                  </button>
                  <button className={`action-btn${obsLooping ? " loop-active" : " secondary"}`} disabled={disabled}
                    onClick={() => onSendCmd({ tcmd: "loop", tseq: Date.now() })}>Loop</button>
                </div>
                <div className="btn-group-stop">
                  <button className="action-btn stop" disabled={disabled}
                    onClick={() => onSendCmd({ tcmd: "stop", tseq: Date.now() })}>Stop</button>
                </div>
              </>
            )}
          </div>

          <div className="vol-wrap">
            <button className={`vol-label-btn${showObsVolume ? " active" : ""}`} onClick={() => setShowObsVolume(v => !v)}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="5" width="3" height="6" fill="currentColor"/><polygon points="4,5 8,2 8,14 4,11" fill="currentColor"/><path d="M10 5.5 C11.5 6.5 11.5 9.5 10 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/><path d="M11.5 3.5 C13.5 5 13.5 11 11.5 12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/></svg>&nbsp;vol
            </button>
            {showObsVolume && ReactDOM.createPortal(
              <div className="compact-popup-backdrop" onClick={() => setShowObsVolume(false)} />,
              document.body
            )}
            {showObsVolume && (
              <div className="vol-slider-row">
                <div className="vol-slider-item">
                  <span>Master</span>
                  <button className="vol-nudge-btn" onClick={() => onSendCmd({ volume: Math.max(0, Math.round(((obsVolume ?? 1) - 0.05) * 100) / 100) })}>−</button>
                  <input type="range" min={0} max={1} step={0.05}
                    value={obsVolume ?? 1}
                    onChange={e => onSendCmd({ volume: Number(e.target.value) })} />
                  <button className="vol-nudge-btn" onClick={() => onSendCmd({ volume: Math.min(1, Math.round(((obsVolume ?? 1) + 0.05) * 100) / 100) })}>+</button>
                </div>
                {obsSubdivision > 1 && (
                  <div className="vol-slider-item">
                    <span>{obsSubdivision === 4 ? "8th" : obsSubdivision === 3 ? "Triplet" : "8th"}</span>
                    <button className="vol-nudge-btn" onClick={() => onSendCmd({ subdivVol: Math.max(0, Math.round(((obsSubdivVol ?? 1) - 0.05) * 100) / 100) })}>−</button>
                    <input type="range" min={0} max={1} step={0.05}
                      value={obsSubdivVol ?? 1}
                      onChange={e => onSendCmd({ subdivVol: Number(e.target.value) })} />
                    <button className="vol-nudge-btn" onClick={() => onSendCmd({ subdivVol: Math.min(1, Math.round(((obsSubdivVol ?? 1) + 0.05) * 100) / 100) })}>+</button>
                  </div>
                )}
                {obsSubdivision === 4 && (
                  <div className="vol-slider-item">
                    <span>16th</span>
                    <button className="vol-nudge-btn" onClick={() => onSendCmd({ subdivVol2: Math.max(0, Math.round(((obsSubdivVol2 ?? 1) - 0.05) * 100) / 100) })}>−</button>
                    <input type="range" min={0} max={1} step={0.05}
                      value={obsSubdivVol2 ?? 1}
                      onChange={e => onSendCmd({ subdivVol2: Number(e.target.value) })} />
                    <button className="vol-nudge-btn" onClick={() => onSendCmd({ subdivVol2: Math.min(1, Math.round(((obsSubdivVol2 ?? 1) + 0.05) * 100) / 100) })}>+</button>
                  </div>
                )}
              </div>
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
          {obsBpmAutoOpen && (isObsMetronome || obsInfiniteEff) && ReactDOM.createPortal(
            <BpmAutoPopup
              mode={obsMode === "clickonly" ? "clickonly" : "fullset"}
              bpm={obsBpm || 80}
              bpmAuto={localBpmAuto} setBpmAuto={v => { setLocalBpmAuto(v); const val = typeof v === 'function' ? v(localBpmAuto) : v; onSendCmd({ bpmAuto: val }); }}
              bpmAutoStep={localBpmAutoStep} setBpmAutoStep={v => { setLocalBpmAutoStep(v); onSendCmd({ bpmAutoStep: v }); }}
              bpmAutoDir={localBpmAutoDir} setBpmAutoDir={v => { setLocalBpmAutoDir(v); onSendCmd({ bpmAutoDir: v }); }}
              bpmAutoTrigger={localBpmAutoTrigger} setBpmAutoTrigger={v => { setLocalBpmAutoTrigger(v); onSendCmd({ bpmAutoTrigger: v }); }}
              bpmAutoBarInterval={localBpmAutoBarInterval} setBpmAutoBarInterval={v => { setLocalBpmAutoBarInterval(v); onSendCmd({ bpmAutoBarInterval: v }); }}
              bpmAutoSecInterval={localBpmAutoSecInterval} setBpmAutoSecInterval={v => { setLocalBpmAutoSecInterval(v); onSendCmd({ bpmAutoSecInterval: v }); }}
              bpmAutoRandom={localBpmAutoRandom} setBpmAutoRandom={v => { setLocalBpmAutoRandom(v); const val = typeof v === 'function' ? v(localBpmAutoRandom) : v; onSendCmd({ bpmAutoRandom: val }); }}
              bpmAutoMin={localBpmAutoMin} setBpmAutoMin={setLocalBpmAutoMin}
              bpmAutoMax={localBpmAutoMax} setBpmAutoMax={setLocalBpmAutoMax}
              anchorRef={bpmGearBtnRef}
              onClose={() => setObsBpmAutoOpen(false)}
            />,
            document.body
          )}
        </div>
      );
    }

"""
src = patch(src, 
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
      const [lastTeacherCmdAt, setLastTeacherCmdAt] = useState(0);
      const watchSilentLoop = useRef(null);
      const [audioRestoreNeeded, setAudioRestoreNeeded] = useState(false);
      const modeRef         = useRef(mode);
      const infiniteRef2    = useRef(infinite);
      const stopwatchRef2   = useRef(stopwatch);
      useEffect(() => { modeRef.current = mode; }, [mode]);
      useEffect(() => { infiniteRef2.current = infinite; }, [infinite]);
      useEffect(() => { stopwatchRef2.current = stopwatch; }, [stopwatch]);

"""
src = patch(src, 
    "      const tapTimes = useRef([]);\n      const wakeLock = useRef(null);\n",
    "      const tapTimes = useRef([]);\n      const wakeLock = useRef(null);\n" + watch_state
)

# ── 5b. Patch wake lock effect to hold lock in student view ──────────────────
src = patch(src,
    "        if (running && !paused) req(); else rel();\n        return () => rel();\n      }, [running, paused]);",
    "        if ((running && !paused) || watchScreen === \"app\") req(); else rel();\n        return () => rel();\n      }, [running, paused, watchScreen]);"
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
          mode, infinite, stopwatch, infiniteByMode, stopwatchPref, elapsedSeconds, bpm, timeSig: timeSig.label, barsPerExercise, exerciseLength,
          minEx, maxEx, countInBars, countInEvery, letterMode,
          exMode, pickedNums, subdivision, beatStates, subdivVol, subdivVol2,
          volume,
          bpmAuto, bpmAutoStep, bpmAutoDir, bpmAutoTrigger, bpmAutoBarInterval, bpmAutoSecInterval, bpmAutoRandom,
          isFirstExOfSet, setCount,
          ts: Date.now(),
        };
        shareDbRef.current.set(payload);
      }, [running, paused, isResuming, looping, phase, setComplete, currentBeat, currentBar,
          exercise, nextEx, countInBeat, mode, infinite, stopwatch, infiniteByMode, stopwatchPref, elapsedSeconds, bpm, timeSig, barsPerExercise,
          exerciseLength, minEx, maxEx, countInBars, countInEvery, letterMode,
          exMode, pickedNums, subdivision, beatStates, subdivVol, subdivVol2,
          volume,
          bpmAuto, bpmAutoStep, bpmAutoDir, bpmAutoTrigger, bpmAutoBarInterval, bpmAutoSecInterval, bpmAutoRandom,
          isFirstExOfSet, setCount,
          watchScreen]);


      // ── Watch: clean up on unmount ─────────────────────────────────────────
      useEffect(() => {
        return () => {
          if (shareInterval.current) clearInterval(shareInterval.current);
          if (watchDbRef.current) { watchDbRef.current.off(); }
        };
      }, []);

      // ── Watch: resume AudioContext when app returns to foreground ───────────
      // iOS suspends the AudioContext when the screen locks. On return to visible,
      // attempt to resume — if it's still suspended after the attempt (no user
      // gesture available), show a tap-to-restore prompt.
      useEffect(() => {
        if (watchScreen !== "app") return;
        const onVisible = () => {
          if (document.visibilityState === "visible") {
            try {
              const ctx = getCtx();
              ctx.resume().then(() => {
                if (ctx.state === "running") setAudioRestoreNeeded(false);
                else setAudioRestoreNeeded(true);
              }).catch(() => setAudioRestoreNeeded(true));
            } catch(e) { setAudioRestoreNeeded(true); }
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
        setMinEx(1);
        setMaxEx(4);
        setCountInBars(1);
        setCountInEvery(true);
        setMode(MODE_FULLSET);
        setInfinite(false);
        setStopwatch(false);
        setInfiniteByMode({ [MODE_FULLSET]: false, [MODE_SEQUENTIAL]: false });
        setStopwatchPref(false);
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
        if (shareCode) {
          _db.ref("sessions/" + shareCode + "/state").set({ ts: Date.now(), studentEnded: true });
          _db.ref("sessions/" + shareCode).remove();
        }
        shareDbRef.current = null;
        setShareCode("");
        setTeacherConnected(false);
        setRunning(false);
        setPaused(false);
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
            if (!s.exists() || s.val().studentEnded) {
              if (watchDbRef.current) { watchDbRef.current.off(); watchDbRef.current = null; }
              setObservedState(null);
              setWatchCode("");
              setWatchEntryCode("");
              setWatchEntryError("");
              setWatchScreen("home");
            } else {
              setObservedState(s.val());
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
          setLastTeacherCmdAt(cmd.tseq || cmd.ts || Date.now());
          if (cmd.tcmd && cmd.tseq && cmd.tseq > lastTSeq.current) {
            lastTSeq.current = cmd.tseq;
            if      (cmd.tcmd === "connected") { setTeacherConnected(true); }
            else if (cmd.tcmd === "start")  { setSetComplete(false); setExercise(null); setNextEx(null); setSetCount(1); setIsFirstExOfSet(false); timerStartRef.current = null; elapsedAccumRef.current = 0; setElapsedSeconds(0); setPaused(false); setLooping(false); setResuming(false); setRunning(true); }
            else if (cmd.tcmd === "stop")   { setRunning(false); setPaused(false); setLooping(false); setResuming(false); setExercise(null); setNextEx(null); setSetComplete(false); setSetCount(1); setIsFirstExOfSet(false); }
            else if (cmd.tcmd === "end-session") { handleStopSharing(); return; }
            else if (cmd.tcmd === "pause")  { setResuming(false); setPaused(true); }
            else if (cmd.tcmd === "resume") { setResuming(true); setPaused(false); }
            else if (cmd.tcmd === "loop")   { setLooping(l => !l); }
          }
          if (cmd.bpm != null) setBpm(Math.min(300, Math.max(30, Math.round(cmd.bpm))));
          if (cmd.mode != null) {
            if (cmd.resetAll) {
              setMode(cmd.mode);
              setInfinite(false);
              setStopwatch(false);
              setInfiniteByMode({ [MODE_FULLSET]: false, [MODE_SEQUENTIAL]: false });
              setStopwatchPref(false);
            } else {
              const prevMode = modeRef.current;
              if (prevMode === MODE_FULLSET || prevMode === MODE_SEQUENTIAL) {
                setInfiniteByMode(prev => ({ ...prev, [prevMode]: infiniteRef2.current }));
              }
              if (prevMode === MODE_CLICKONLY) {
                setStopwatchPref(stopwatchRef2.current);
              }
              setMode(cmd.mode);
              setInfiniteByMode(prev => {
                const restoredInf = (cmd.mode === MODE_FULLSET || cmd.mode === MODE_SEQUENTIAL) ? (prev[cmd.mode] ?? false) : false;
                setInfinite(restoredInf);
                return prev;
              });
              setStopwatchPref(prev => {
                const restoredSw = cmd.mode === MODE_CLICKONLY ? prev : false;
                setStopwatch(restoredSw);
                return prev;
              });
            }
          } else {
            if (cmd.infinite != null) { const inf = !!cmd.infinite; setInfinite(inf); setInfiniteByMode(prev => ({ ...prev, [modeRef.current]: inf })); }
            if (cmd.stopwatch != null) { setStopwatch(!!cmd.stopwatch); setStopwatchPref(!!cmd.stopwatch); }
          }
          if (cmd.timeSig != null) { const ts = TIME_SIGS.find(t => t.label === cmd.timeSig); if (ts) setTimeSig(ts); }
          if (cmd.countInBars != null) setCountInBars(cmd.countInBars);
          if (cmd.countInEvery != null) setCountInEvery(!!cmd.countInEvery);
          if (cmd.exerciseLength != null) setExerciseLength(cmd.exerciseLength);
          if (cmd.minEx != null) { const v = Math.min(200, Math.max(1, cmd.minEx)); setMinEx(v); }
          if (cmd.maxEx != null) { const v = Math.min(200, Math.max(1, cmd.maxEx)); setMaxEx(v); }
          if (cmd.barsPerExercise != null) setBarsPerExercise(cmd.barsPerExercise);
          if (cmd.exMode != null) setExMode(cmd.exMode);
          if (cmd.pickedNums != null) setPickedNums(Array.isArray(cmd.pickedNums) ? cmd.pickedNums.map(Number) : []);
          if (cmd.letterMode != null) setLetterMode(!!cmd.letterMode);
          if (cmd.subdivision != null) setSubdivision(cmd.subdivision);
          if (cmd.beatStates != null) setBeatStates(Array.isArray(cmd.beatStates) ? cmd.beatStates : defaultBeatStates(timeSig.label));
          if (cmd.volume != null) setVolume(Math.min(1, Math.max(0, cmd.volume)));
          if (cmd.subdivVol != null) setSubdivVol(Math.min(1, Math.max(0, cmd.subdivVol)));
          if (cmd.subdivVol2 != null) setSubdivVol2(Math.min(1, Math.max(0, cmd.subdivVol2)));
          if (cmd.bpmAuto != null) setBpmAuto(!!cmd.bpmAuto);
          if (cmd.bpmAutoStep != null) setBpmAutoStep(cmd.bpmAutoStep);
          if (cmd.bpmAutoDir != null) setBpmAutoDir(cmd.bpmAutoDir);
          if (cmd.bpmAutoTrigger != null) setBpmAutoTrigger(cmd.bpmAutoTrigger);
          if (cmd.bpmAutoBarInterval != null) setBpmAutoBarInterval(cmd.bpmAutoBarInterval);
          if (cmd.bpmAutoSecInterval != null) setBpmAutoSecInterval(cmd.bpmAutoSecInterval);
          if (cmd.bpmAutoRandom != null) setBpmAutoRandom(!!cmd.bpmAutoRandom);
        });
        return () => { cmdsRef.off(); cmdDbRef.current = null; };
      }, [watchScreen, shareCode]);

      // ── Watch: auto-end student session after 30 min idle ────────────────
      useEffect(() => {
        if (watchScreen !== "share" && watchScreen !== "app") return;
        const timer = setTimeout(() => handleStopSharing(), 30 * 60 * 1000);
        return () => clearTimeout(timer);
      }, [watchScreen, lastTeacherCmdAt]);

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
src = patch(src, 
    '\n\n      useEffect(() => {\n        if (!showMuteHint || phase !== "playing") return;',
    '\n\n' + watch_effects + '      useEffect(() => {\n        if (!showMuteHint || phase !== "playing") return;',
    1
)

# ── 6a-ii. Force letterMode to false in Watch — never load from localStorage ──
# Watch always starts in Number Mode regardless of what the student's main app
# had saved. Prevents Letter Mode from persisting into a watch session.
src = patch(src, 
    "      const [letterMode,          setLetterMode]          = useState(() => saved?.letterMode ?? false);",
    "      const [letterMode,          setLetterMode]          = useState(false);"
)

# ── 6b. Expose getCtx from useDrumTimer so App can use it for watchSilentLoop ──
# getCtx is defined inside useDrumTimer but the "Open Shuffle" button needs it
# in App scope to create the silent loop that keeps the AudioContext alive.
# getCtx is already returned by useDrumTimer in the current source — no patch needed.
# The return line now reads: { currentBeat, currentBar, currentSubdiv, phase, flashOn, countInBeat, isResuming, getCtx }
src = patch(src,
    "      const { currentBeat, currentBar, currentSubdiv, phase, flashOn, countInBeat, isResuming } = useDrumTimer({",
    "      const { currentBeat, currentBar, currentSubdiv, phase, flashOn, countInBeat, isResuming, getCtx } = useDrumTimer({"
)

# ── 6c. Prevent AudioContext close when student is sharing ───────────────────
# When the student is sharing (watchScreen === "app"), closing the AudioContext
# on stop means the next teacher-triggered Start creates a new suspended context
# that can't be resumed outside a user gesture. Keep it alive instead.
src = patch(src,
    "    function useDrumTimer({ bpm, beatsPerBar, barsPerExercise, minEx, maxEx,\n"
    "                            onNewExercise, onNextExercise, onSetComplete, onSetLoop,\n"
    "                            running, paused, resuming,\n"
    "                            countInBars, countInEveryRound,\n"
    "                            mode, volume, looping, infinite, setComplete,\n"
    "                            exMode, pickedNums, subdivision, beatStates, subdivVol, subdivVol2 }) {",
    "    function useDrumTimer({ bpm, beatsPerBar, barsPerExercise, minEx, maxEx,\n"
    "                            onNewExercise, onNextExercise, onSetComplete, onSetLoop,\n"
    "                            running, paused, resuming,\n"
    "                            countInBars, countInEveryRound,\n"
    "                            mode, volume, looping, infinite, setComplete,\n"
    "                            exMode, pickedNums, subdivision, beatStates, subdivVol, subdivVol2, keepCtxAlive }) {"
)
src = patch(src, 
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
src = patch(src,
    "        mode, volume, looping, infinite, setComplete,\n        exMode, pickedNums, subdivision, beatStates, subdivVol, subdivVol2,\n      });",
    "        mode, volume, looping, infinite, setComplete,\n        exMode, pickedNums, subdivision, beatStates, subdivVol, subdivVol2,\n        keepCtxAlive: watchScreen === \"app\",\n      });"
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
            <button className="watch-btn-base watch-btn primary" onClick={handleStartSharing}>Share my session</button>
            <button className="watch-btn-base watch-btn secondary" onClick={() => setWatchScreen("watch-entry")}>Watch a session</button>
            <div style={{ fontSize: "0.55rem", color: "#444", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", marginTop: "0.5rem" }}>v1.9.15 · watch 1.63</div>
          </div>
        )}
        {watchScreen === "share" && (
          <div className="watch-overlay">
            <div className="watch-overlay-title">Sharing</div>
            <div className="share-code-box">
              <div className="share-session-label">Your session code</div>
              <div className="share-session-code">{shareCode}</div>
            </div>
            {teacherConnected
              ? <div className="share-session-hint" style={{ color: "#4caf50" }}>Teacher connected — tap Open Shuffle to begin.</div>
              : <div className="share-session-hint">Open shuffleclick.com/watch on another device and enter this code.</div>}
            <button className="watch-btn-base watch-btn primary" onClick={() => { try { const ctx = getCtx(); ctx.resume().catch(() => {}); if (!watchSilentLoop.current) { const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; const gain = ctx.createGain(); gain.gain.value = 0.001; src.connect(gain); gain.connect(ctx.destination); src.start(); watchSilentLoop.current = src; } } catch(e) {} setWatchScreen("app"); }}>Open Shuffle</button>
            <button className="watch-btn-base watch-btn secondary" onClick={handleStopSharing}>Stop sharing</button>
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
            <button className="watch-btn-base watch-connect-btn" disabled={!watchEntryCode.includes("-")} onClick={() => handleConnectWatch(watchEntryCode)}>Connect</button>
            <button className="watch-back-btn" onClick={() => { setWatchScreen("home"); setWatchEntryCode(""); setWatchEntryError(""); }}>← back</button>
          </div>
        )}
        <div className={`app${watchScreen === "app" ? " watch-active" : ""}`} style={watchScreen === "app" || watchScreen === "share" ? {} : { display: "none" }}>"""

src = patch(src, old_return_open, watch_jsx, 1)

old_close = '\n        </div>\n      );'
new_close = '\n        </div>\n        </>\n      );'
last_idx = src.rfind(old_close)
src = src[:last_idx] + new_close + src[last_idx + len(old_close):]

# ── 8. (sharing indicator patch moved to section 3b) ────────────────────────

# ── 9. Strip beta suffix from footer version string ─────────────────────────

src = re.sub(r'(v\d+\.\d+\.\d+)\.beta\.\d+', r'\1', src)

# ── Write output ─────────────────────────────────────────────────────────────

with open(DEST, "w") as f:
    f.write(src)

print(f"Built {BETA_DEST} ({len(src):,} bytes)")
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
    "keepCtxAlive",
    "getCtx",
]
for token in checks:
    if token not in src:
        print(f"  WARNING: '{token}' not found in output")
for label in _patch_warnings:
    print(f"  WARNING: patch target not found — '{label}'")
print("Done.")
