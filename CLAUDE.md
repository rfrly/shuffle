# Shuffle — Project Instructions

Shuffle is a web app for musicians that randomises practice exercises and provides a metronome. Built for personal use and sharing with students, with the intention of making it publicly available for wider use. Designed to work across all platforms — currently focused on iPhone, iPad, and Mac.

---

## Tech stack

Single-file React app (Babel transpiled, no build step) — one index.html file. Web Audio API for the metronome engine. No dependencies beyond React 18 and Babel via CDN. Deployed on GitHub Pages at shuffleclick.com. Repo is rfrly/shuffle on GitHub. File must be named index.html alongside shuffle-icon.png in the repo root.

---

## Claude Code workflow

- All development happens directly in the repo — no file uploads needed
- Before making any changes, confirm the current version number in index.html
- To preview changes locally, open index.html directly in a browser (no build step needed — just open the file)
- Test in the browser before committing
- When changes are ready, commit and push to GitHub via Claude Code or the terminal
- If working across two Macs, always push before switching machines and pull before starting work on the other

---

## Key technical decisions

- Lookahead scheduler (25ms interval, 0.2s lookahead) for accurate timing
- Woodblock sound for count-in, oscillator click for metronome — kept distinct intentionally
- Audio context is never suspended on pause — scheduler interval is cleared instead, avoids rogue clicks on resume
- schedulerFn ref stores the scheduler function so resume can restart it without re-picking exercises
- Settings persisted to localStorage under key shuffle_settings_v7
- iOS background audio stops when the app leaves the screen — this is a fundamental WebKit limitation

---

## Fonts and colours

- Share Tech Mono (monospace) and Barlow (body)
- Amber #f5c842 — current exercise, title, Start button
- Orange #ff4500 — count-in beats, active beat dot
- White — beat 1 dot
- Background #0f0f0f, display zone #1a1a1a

---

## Modes

- Shuffle — plays every exercise once in random order, then stops
- Sequential — plays exercises in order, then stops
- Random — picks randomly and runs until stopped
- Click Only — metronome with bar counter, runs until stopped

---

## UI and behaviour

- Settings split into variable (Mode, BPM, Rounds, Count in) and fixed (Exercises, Exercise length, Time signature) — fixed group slightly dimmed
- Transport buttons: Pause, Loop, Stop, Vol — consistent dark fill base, amber for active Loop, white for active Pause, red-tinted for Stop
- Start button amber filled, only visible when idle
- ? help button top right of header, balanced with invisible spacer so title stays centred
- Idle state shows a one-line summary of current settings
- Terminology: "Rounds" not "repetitions", "Exercises" not "Range", "Stop" not "Reset"
- Count-in is always on — no off option; lengths are 1, 2, or 4 bars; optional "count in every round" checkbox (disabled in Click Only mode)
- All controls 44px minimum height
- Responsive layout for iPhone, iPad portrait, iPad landscape, Mac — iPad uses (hover: none) and (pointer: coarse) and (min-width: 768px) media queries
- Version number in footer, incremented with each meaningful update

---

## Version management and commit messages

After all changes are complete, ask: "What's changed since the last deployed version?" Then update the version number in the file and present the version number and commit message together before committing.

Version numbering:
- Major feature additions (new modes, significant functionality): increment minor version (1.3.x → 1.4.0)
- Bug fixes, refinements, UI polish: increment patch version (1.4.0 → 1.4.1)

Test builds (test/index.html):
- Use the current live version with a beta suffix: if live is v1.5.33, test builds are v1.5.33.beta.1, v1.5.33.beta.2, etc.
- Never change the version number in the live index.html until changes are confirmed working and ready to ship
- When copying index.html to test/, always update the version to the next beta number
- When making any subsequent edits to test/index.html, always increment the beta suffix (e.g. beta.1 → beta.2)
- When copying index.html to test/, also update the apple-touch-icon and icon hrefs to shuffle-icon-beta.png?v=1

Commit message format:
vX.X.X - Brief summary of main change

- Specific change
- Specific change
- Specific change

Only describe changes since the last deployed version. Keep it to 3–5 bullets.
