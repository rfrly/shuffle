# Shuffle — Project Instructions

Shuffle is a web app for musicians that randomises practice exercises and provides a metronome. Built for personal use and sharing with students, with the intention of making it publicly available for wider use. Designed to work across all platforms — currently focused on iPhone, iPad, and Mac.

---

## Tech stack

Single-file React app (Babel transpiled, no build step) — one index.html file. Web Audio API for the metronome engine. No dependencies beyond React 18 and Babel via CDN. Deployed on GitHub Pages at shuffleclick.com. Repo is rfrly/shuffle on GitHub. File must be named index.html alongside shuffle-icon.png in the repo root. Test builds live in test/index.html alongside test/shuffle-icon-beta.png. The watch app (watch/index.html) additionally uses Firebase Realtime Database via CDN — see Watch feature section.

---

## Claude Code workflow

- All development happens directly in the repo — no file uploads needed
- Before making any changes, confirm the current version number in index.html
- All new changes go into test/index.html first — never edit the live index.html directly until changes are confirmed working
- To preview changes locally, open test/index.html in a browser (no build step needed — just open the file)
- When changes are confirmed working, copy test/index.html to index.html, update the version number in index.html (removing the beta suffix), and commit
- After any changes to test/index.html, run `python3 build-watch.sh` to regenerate watch/index.html and commit both together
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
- `.app` uses `overflow: clip` not `overflow: hidden` — `overflow: hidden` creates a scroll container on iOS which constrains `position: fixed` children, preventing them from covering the full screen (home indicator zone)
- Help overlay renders inside `.app`, not via portal — portalled `position: fixed` elements are constrained by `body { height: 100% }` on iOS PWA and won't reach the bottom of the screen

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
- Metronome — bar counter, runs until stopped

---

## UI and behaviour

- Single unified controls grid — no section divider; 3-col on tablet/desktop, 2-col on mobile
- Control order (left to right, top to bottom): Mode (full-width), BPM, Time sig, Count in, Exercise length, Exercises, Rounds
- Exercise length, Time sig, and Count in use CompactSelector — a button that opens a popup with options; rendered via React portal into document.body to avoid overflow clipping
- Count in popup includes "count in every exercise" checkbox; button shows ✓ when active
- No dimming of fixed controls — all controls same visual weight
- Transport buttons: Pause, Loop, Stop, Vol — consistent dark fill base, amber for active Loop, white for active Pause, red-tinted for Stop
- Start button amber filled, only visible when idle
- ? help button top right of header, balanced with invisible spacer so title stays centred
- Idle state shows a one-line summary of current settings
- Terminology: "Rounds" not "repetitions", "Exercises" not "Range", "Stop" not "Reset", "Metronome" not "Click Only"
- Count-in is always on — no off option; lengths are 1, 2, or 4 bars; optional "count in every exercise" checkbox (disabled in Metronome mode)
- All controls 44px minimum height
- Responsive layout for iPhone, iPad portrait, iPad landscape, Mac — iPad uses (hover: none) and (pointer: coarse) and (min-width: 768px) media queries
- Version number in footer, incremented with each meaningful update
- Exercises control has two modes: Range (min–max with swipe-to-adjust and tap-to-numpad) and Pick (select specific exercise numbers via BarPickerPopup); toggled via Range/Pick buttons
- EX_MAX is 200; exercise numbers are formatted as two digits with leading zero (fmt())
- Letter mode is a hidden feature that displays exercises as A–Z instead of numbers; activated by long-pressing the version footer (800ms); limited to 26 exercises (EX_MAX_LETTERS); persisted to localStorage
- Idle summary shows picked exercises as a comma list up to 4, then switches to "N exercises" beyond that; range mode uses "X-bar ex" (not "exercise") to save space
- useSwipeInput must call e.preventDefault() in onTouchStart — without it, iOS PWA mode focuses the input and shifts the viewport, causing a persistent touch coordinate offset across the whole app

---

## Version management and commit messages

After all changes are complete, ask: "What's changed since the last deployed version?" Then update the version number in the file and present the version number and commit message together before committing.

Version numbering:
- Major feature additions (new modes, significant functionality): increment minor version (1.3.x → 1.4.0)
- Bug fixes, refinements, UI polish: increment patch version (1.4.0 → 1.4.1)

Test builds (test/index.html):
- All new development happens in test/index.html, not the live index.html
- Use the next target version with a beta suffix: if live is v1.5.33 and the next version will be v1.5.34, test builds are v1.5.34.beta.1, v1.5.34.beta.2, etc.
- Never change the version number in the live index.html until changes are confirmed working and ready to ship
- When starting a new batch of changes, copy index.html to test/ and update the version to the next beta number
- When making any subsequent edits to test/index.html, always increment the beta suffix (e.g. beta.1 → beta.2)
- test/index.html always uses shuffle-icon-beta.png — keep the apple-touch-icon and icon hrefs pointing to shuffle-icon-beta.png?v=N, incrementing N when the beta icon changes

Commit message format:
vX.X.X - Brief summary of main change

- Specific change
- Specific change
- Specific change

Only describe changes since the last deployed version. Keep it to 3–5 bullets.

---

## Watch feature (shuffleclick.com/watch/)

A private teacher/student session observation tool. Not part of the public app — not linked from anywhere in the main app.

### What it does
- Student opens `shuffleclick.com/watch/` → taps "Share my session" → gets a two-word code (e.g. `BIRD-BOAT`) → share screen shows code and waits
- When teacher connects, student's share screen shows green "Teacher connected" message → student taps "Open Shuffle" → this tap unlocks the iOS Web Audio context (required by iOS before any audio can play) and transitions to the app; controls are dimmed and non-interactive while sharing
- Teacher opens `shuffleclick.com/watch/` on their device → taps "Watch a session" → enters the code → sees a live view of the student's session and can control all settings and transport (BPM, mode, time sig, count-in, exercise length, exercises, rounds, start/pause/loop/stop)
- Sessions auto-delete from Firebase when the student closes or navigates away
- Teacher session auto-disconnects after 30 minutes of inactivity
- **iOS audio note:** The student must tap "Open Shuffle" before the teacher starts — this is the required user gesture to unlock the Web Audio context. If the teacher starts before the student taps, the metronome will hang silently. The green "Teacher connected" prompt exists specifically to prompt this tap.


### Files
- `watch/index.html` — the watch app. **Do not edit this file directly.** It is generated by `build-watch.sh`.
- `watch/shuffle-icon-watch.png` — the watch app icon
- `build-watch.sh` — Python script that builds `watch/index.html` from `test/index.html` by injecting the watch layer

### How it's built
`watch/index.html` is the full Shuffle app (copied from `test/index.html`) with the following injected by `build-watch.sh`:
1. Firebase SDK script tags (compat library, Realtime Database)
2. Watch-specific CSS (home/share/watch-entry/observer screens; student control dimming)
3. `src.replace()` patches on student controls — adds `watch-locked` class to control groups and guards on `handleTap`, `incBpm`, `decBpm`, `incBars`, `decBars` to block interaction when `watchScreen === "app"`
4. Firebase init + `ObserverDisplay` React component (teacher's interactive view)
5. Watch mode state variables in `App` (`watchScreen`, `shareCode`, `observedState`, etc.)
6. `useEffect` that broadcasts live playback state (including `isResuming`) to Firebase at `sessions/{CODE}/state`
7. Watch handlers (`handleStartSharing`, `handleStopSharing`, `handleConnectWatch`, `handleDisconnectWatch`, `handleSendCmd`)
8. Student command listener — reads teacher commands from `sessions/{CODE}/cmds` and applies them
9. Watch UI overlays wrapping the JSX return (home/share/watch-entry screens; observer view renders instead of the main app when watching)

### Keeping watch in sync with the main app

**CRITICAL RULE: Never edit `test/index.html` for watch feature work.** `test/index.html` is the main Shuffle app source only. All watch-specific behaviour (student control dimming, teacher UI, Firebase logic) must be implemented as `src.replace()` patches inside `build-watch.sh`.

**Never edit `watch/index.html` directly** — it is a generated file and changes will be overwritten next time `build-watch.sh` runs.

After making changes to `test/index.html` (main app changes only), run:
```
python3 build-watch.sh
```
This rebuilds `watch/index.html` from scratch. Commit both `test/index.html` and `watch/index.html` together.

For watch-only changes (e.g. teacher UI, Firebase logic), edit `build-watch.sh` and run `python3 build-watch.sh`. Commit only `build-watch.sh` and `watch/index.html` — do not touch `test/index.html`.

### Firebase
- Project: `shuffle-watch-d578b` (Firebase console)
- Database: `shuffle-watch-d578b-default-rtdb.europe-west1.firebasedatabase.app`
- Free Spark plan — sufficient for personal use (100 concurrent connections)
- Security rules: state is readable by anyone, writable with timestamp protection and validated to require a numeric `ts` field; cmds path is freely writable (teacher sends commands); auto-deleted via `onDisconnect().remove()` when the student leaves. Rules currently applied in Firebase console:
  ```json
  {
    "rules": {
      "sessions": {
        "$code": {
          ".read": true,
          "state": {
            ".write": "!data.exists() || data.child('ts').val() < newData.child('ts').val()",
            ".validate": "newData.hasChildren(['ts']) && newData.child('ts').isNumber()"
          },
          "cmds": {
            ".write": true
          }
        }
      }
    }
  }
  ```
- API key is restricted in Google Cloud Console to HTTP referrers `https://shuffleclick.com/*` and `https://www.shuffleclick.com/*` — rotate key in Cloud Console and update `build-watch.sh` if compromised
- Firebase config (including API key) is embedded in `build-watch.sh` — if the Firebase project ever changes, update it there
- Local testing: open via `python3 -m http.server 8000` and `http://localhost:8000/watch/` rather than `file://` (API key referrer restriction doesn't cover `file://` origins)

---

## Referral tracking

GoatCounter is used for analytics. Referrals are tracked via the `?ref=` query parameter.

Redirect pages (in repo root, each as `folder/index.html`):
- `/me` → `?ref=me` — personal use and testing
- `/ross` → `?ref=ross` — shared with a friend
- `/s` → `?ref=student` — shared with students

Direct referral links (no redirect):
- `?ref=bmc` — Buy Me A Coffee
- `?ref=web` — rossfarley.com
- `?ref=facebook`
- `?ref=bluesky`
- `?ref=reddit`
- `?ref=instagram`
- `?ref=email`
- `?ref=youtube`
