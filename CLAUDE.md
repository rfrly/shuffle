# Shuffle — Project Instructions

Shuffle is a web app for musicians that randomises practice exercises and provides a metronome. Built for personal use and sharing with students, with the intention of making it publicly available for wider use. Designed to work across all platforms — currently focused on iPhone, iPad, and Mac.

---

## Tech stack

Vite + React app with ES modules. Web Audio API for the metronome engine. React 18, Vite 5. Deployed on GitHub Pages at shuffleclick.com via GitHub Actions (push to `main` triggers build and deploy). Repo is rfrly/shuffle on GitHub. Icons and static assets live in `public/`. `public/sound-test.html` is a dev tool for designing the clave metronome sound — intentionally committed but not linked from anywhere in the app (accessible at shuffleclick.com/sound-test.html). Source files in `src/` — entry point is `src/main.jsx`, main component is `src/components/App.jsx`. The watch app (watch/index.html) additionally uses Firebase Realtime Database via CDN — see Watch feature section.

Source file structure:
- `src/main.jsx` — entry point
- `src/components/App.jsx` — main App component
- `src/components/NumpadComponents.jsx` — NumpadPopup, BarPickerPopup, fmt, numToLetter, fmtEx
- `src/components/BarProgress.jsx` — BarProgress
- `src/components/CompactSelector.jsx` — CompactSelector
- `src/styles.css` — all CSS
- `src/constants.js` — TIME_SIGS, mode constants, STORAGE_KEY, numeric constants
- `src/storage.js` — loadSettings, saveSettings, loadUrlParams
- `src/audio.js` — getCompressor, scheduleWoodblock, scheduleEndBell, scheduleMetronomeClick, startSilentLoop
- `src/useDrumTimer.js` — scheduler hook
- `src/useInteraction.js` — useLongPress, useSwipeInput

---

## Claude Code workflow

- All development happens on the `dev` branch — **never commit directly to `main`**
- Before making any changes, check the current version in `src/components/App.jsx` (footer JSX) against the latest git commit message. If they don't match, update the footer to the correct beta number first.
- To preview changes locally: `npm run dev` — opens a live-reloading dev server
- All changes to the main app go in `src/` files only — never edit `beta/index.html` or `watch/index.html` (generated files) directly
- After any main app changes, run `python3 build.py` (or `npm run generate`) to regenerate `beta/index.html` and `watch/index.html`, then commit `beta/index.html`
- To test on device: push to `dev`, then open `shuffleclick.com/beta/` — shows the current beta. Allow 2–3 minutes for GitHub Actions to deploy
- When changes are confirmed working, open a PR from `dev` → `main` on GitHub — merging triggers deployment to shuffleclick.com
- If working across two Macs, always push before switching machines and pull before starting work on the other

**CRITICAL — what deploys where:**

| App | URL | Always deployed from |
|-----|-----|---------------------|
| Live | `shuffleclick.com/` | `main` |
| Watch | `shuffleclick.com/watch/` | `main` |
| Beta | `shuffleclick.com/beta/` | `dev` |

The deploy workflow runs on every push to `main` or `dev`. Live and watch always come from `main`. Beta always comes from `dev` (hardcoded via `ref: dev` in `.github/workflows/deploy.yml` — do not change this). A push to `dev` never touches live or watch. A merge to `main` never touches beta.

**Beta update workflow:**
1. Work on `dev` — edit `src/` only
2. Run `python3 build.py` — this always regenerates both `beta/index.html` and `watch/index.html`, but only `beta/index.html` is committed from `dev`
3. Commit `src/` changes, `build.py` (if changed), and `beta/index.html` — **never include `watch/index.html` in a beta commit**
4. Push to `dev` — beta updates at `shuffleclick.com/beta/` within ~3 minutes
5. When ready to ship beta: apply any pending watch fixes to `dev`'s `build.py` first (so watch stays in sync), run `python3 build.py`, then PR `dev` → `main`

**Key rule:** Beta updates never commit `watch/index.html`. The script always regenerates it locally, but on `dev` it must never be staged or committed — the watch app is live on `main` and must never receive beta features.

**CSS changes that affect the watch teacher UI:** If a `src/styles.css` change adds, removes, or renames a CSS class that is used in `build.py`'s watch JSX (e.g. `ObsVolPopup`, `ObserverDisplay`, student view patches), the watch app will not pick it up from the `dev` → `main` PR alone — the CSS is inlined at build time and `watch/index.html` is never committed from `dev`. In this case, open a watch hotfix branch off `main` at the same time as the PR, apply the same `src/styles.css` changes there, regenerate, and merge the hotfix immediately after the PR lands.

**Watch update workflow:**
1. Branch off `main`: `git checkout main && git checkout -b hotfix/description`
2. Edit `build.py` only — never edit `src/`
3. **Always bump the watch version number** in `build.py` (e.g. `watch 1.1` → `watch 1.2`) — this confirms the deployment worked
4. Run `python3 build.py`, then **test locally before committing**: run `python3 -m http.server 8000` and open `http://localhost:8000/watch/` — verify the watch app loads, the home screen shows the new version number, and the core flow works (share session, connect, start/stop). Do not skip this step — a broken watch hotfix goes live immediately with no staging safety net.
5. Commit `build.py`, `watch/index.html`, and `beta/index.html`, push, open PR to `main`
6. Merge the PR — watch updates at `shuffleclick.com/watch/` within ~3 minutes
7. Switch back to `dev`: `git checkout dev` — **do not merge `main` into `dev`**. Instead, manually apply the same `build.py` changes to `dev` so it stays in sync. Run `python3 build.py`, commit, push.

**Never:**
- Merge `dev` → `main` to ship a watch fix — always use a hotfix branch off `main`
- Edit `src/` in a watch hotfix branch — watch logic lives in `build.py` patches
- Cherry-pick generated files (`watch/index.html`, `beta/index.html`) — always regenerate with `python3 build.py`
- Merge `main` into `dev` while beta is in progress — this causes conflicts in generated files. Manually apply watch fixes to `dev`'s `build.py` instead.
- Skip bumping the watch version — without it there's no way to confirm the deployment worked

---

## Key technical decisions

- Lookahead scheduler (25ms interval, 0.2s lookahead) for accurate timing
- Woodblock sound for count-in, oscillator click for metronome — kept distinct intentionally. Metronome click sound (`metSound`) is user-selectable: `digital1` (Blip, sine, default), `digital2` (Ping, triangle), `tick` (Tick, noise). This preference is persisted to localStorage but intentionally excluded from "Reset to defaults" and "Share settings" — it's a device-level preference, not a session setting. It IS however controllable by the teacher in Watch mode (teacher can change the student's click sound mid-session).
- Tick click and woodblock count-in are both pre-rendered via `OfflineAudioContext` once per AudioContext and cached on the context object (`ctx._tickBufs`, `ctx._woodblockBufs`). Noise is generated with a seeded PRNG (mulberry32, fixed seeds per variant) so rendered buffers are identical across page loads and devices — eliminates wild volume variance from synthesising fresh bandpass-filtered noise on every hit. The gain envelope is baked into the offline render; playback applies only the master `vol` scalar. `scheduleWoodblock` has three variants: downbeat (2000 Hz / gain 2.8), normal (1400 Hz / 2.0), subdivision (900 Hz / 1.4). For `tick`, count-in subdivisions use the triangle oscillator at 440 Hz / gain 0.3 (one octave below the normal count-in beat). Count-in subdivisions are scheduled on every beat including the last — the subdivision grid is continuous across count-in/exercise boundaries. On the beat where a count-in takes over (`isNewExercise && interCountInBeats > 0`), the playing phase skips its click and subdivisions entirely so only the woodblock fires.
- Audio context is never suspended on pause — scheduler interval is cleared instead, avoids rogue clicks on resume
- schedulerFn ref stores the scheduler function so resume can restart it without re-picking exercises
- Settings persisted to localStorage under key shuffle_settings_v7; URL params (`?bpm=`, `?sig=`, `?min=`, `?max=`, `?mode=`, `?rounds=`, `?exlen=`, `?cib=`, `?cie=`, `?exmode=`, `?picks=`, `?lm=`, `?inf=`, `?sw=`) override localStorage on load and are stripped from the URL immediately via `history.replaceState`
- iOS background audio stops when the app leaves the screen — this is a fundamental WebKit limitation
- `.app` uses `overflow: clip` not `overflow: hidden` — `overflow: hidden` creates a scroll container on iOS which constrains `position: fixed` children, preventing them from covering the full screen (home indicator zone)
- Help overlay renders inside `.app`, not via portal — portalled `position: fixed` elements are constrained by `body { height: 100% }` on iOS PWA and won't reach the bottom of the screen
- `.display` is a CSS container (`container-type: inline-size`). All text, beat dots, and bar progress inside the display zone are sized with container-query units (`cqw`), not viewport units (`vw`). This keeps text proportional to the display zone itself, which is `max-width`-capped per breakpoint (440 / 560 / 640 / 700 px). Never add per-breakpoint `font-size` overrides for `.exercise-number`, `.countdown-display`, `.exercise-label`, `.next-exercise`, `.idle-summary`, `.bar-progress-counter`, `.beat-dot`, `.bar-block`, or `.bar-progress-track/fill` — the `cqw` clamp already handles every viewport. Overrides will re-introduce the size drift the container query was designed to eliminate. The watch student view (`.watch-active .display`) and teacher observer view (`.observer-app .display`) inherit the same container rules, so there's no need for surface-specific size overrides either. Metronome stopwatch uses `.exercise-number.stopwatch-time` with `letter-spacing: -0.05em` so the wider `M:SS` string fits at the same font-scale as the 2-digit exercise number; `.display--timer .countdown-display` matches so text does not jump when count-in transitions into the timer.

---

## Modes

- Shuffle — plays every exercise once in random order, then stops
- Sequence — plays exercises in order, then stops
- Metronome — bar counter, runs until stopped; tap the active Metronome button again to toggle display mode. `displayMode === 'bars'` shows a bar counter (badge `[#]`); `displayMode === 'timer'` shows elapsed time in M:SS (badge `[⏱︎]`, forced text rendering via `\uFE0E`). Beat dots are 44px tappable circles — tap to cycle accent → normal → silent per beat. Accent dots are amber, silent dots are dim with a dashed outline. In Metronome mode the controls grid shows only BPM, Time sig, Count in (no "count in every exercise" checkbox — hidden not disabled). Exercise length, Exercises, Rounds Per Exercise are hidden. No idle summary is shown. BarProgress is hidden. **Scheduler note:** settings like `countInEveryRound` and `barsPerExercise` persist in state when switching to Metronome mode — they are not reset. Scheduler logic that reads these (or values derived from them, e.g. `interCountInBeats`) must account for this. The pattern is to zero out or neutralise Shuffle/Sequence-only derived values at their point of computation when `currentMode === MODE_CLICKONLY`, rather than adding per-use-site guards.
- Sets / tap-to-cycle — tapping the active Shuffle or Sequence button cycles through sets: ×1 → ×2 → ×3 → ∞ → ×1. The active button shows a badge (`[×2]`, `[×3]`, `[∞]`). ×1 plays one set and stops; ×2/×3 play that many sets and stop; ∞ loops continuously. Switching modes always resets sets to ×1 — modes do not remember their last sets value. Set boundaries are signalled two ways: (1) the exercise label briefly shows "SET 2", "SET 3" etc. in amber from the inter-exercise count-in through the first bar of the new set (`isFirstExOfSet` state, set by `handleSetLoop`, cleared by a `useEffect`: for multi-bar exercises (`bpe > 1`) when `phase === "playing" && currentBar > 0`; for single-bar exercises (`bpe === 1`) when the next exercise's count-in begins (tracked via `hasPlayedFirstBar` ref)); (2) the final exercise of each set shows "last exercise" in the next-exercise area (`onNext(-1)` fired from `useDrumTimer` when `playingBars % totalBarsPerSet === totalBarsPerSet - bpe`, guarded by `totalInSet > 1`). The idle summary includes the sets suffix when sets ≠ 1 (e.g. "shuffle ×2", "shuffle ∞"). **`exercisesPlayed` reset at set boundary:** the set-loop fires (`playingBars % totalBarsPerSet === 0`) on the same beat as `isNewExercise` for the last exercise of the set. The reset must be `exercisesPlayed.current = 0` (not 1) at that point — `isNewExercise` immediately increments it to 1 for that beat, so set 2 starts with the correct count of 1.

**BPM automation** — a ⚙ gear button appears next to the BPM widget when in Metronome mode or Shuffle/Sequence ×2/×3/∞ mode. Tapping it opens a portal-rendered popup (`BpmAutoPopup` component in `App.jsx`) with:
- A master **Auto BPM** toggle (full-width button; amber fill = on, dim = off — same pattern as mode buttons)
- **Shuffle/Sequence ×2/×3/∞**: step amount (1–10, default 2) + ▲ Up / ▼ Down direction; triggers after each full set completes via `onSetLoop` callback in `useDrumTimer` → `handleSetLoop` in App; set completion detected by counting playing bars (`playingBars` ref) and firing when `playingBars % totalBarsPerSet === 0` where `totalBarsPerSet = totalInSet * bpe`
- **Metronome**: same step/direction controls plus an "Every N bars/sec" trigger; bars and seconds have independent state (`bpmAutoBarInterval` default 8, `bpmAutoSecInterval` default 30); bar trigger uses a `useEffect` watching `exercise` state (increments each bar in Metronome mode); `'set'` trigger value is treated as `'bars'` in Metronome mode; time trigger uses `setInterval`
- **Random tempo** (Shuffle/Sequence ∞ only; secondary/niche): demoted below a divider; hidden in Metronome mode (popup uses `isMetronome` guard); `applyBpmStep` also guards on `mode !== MODE_CLICKONLY` so persisted random state can't apply in Metronome; seeds min/max from `bpm ± 7%` each time the popup opens (not persisted); max span 8 BPM
- All controls below the master toggle are greyed out (`bpm-auto-disabled` class) when Auto BPM is off
- Settings persisted to localStorage except `bpmAutoMin`/`bpmAutoMax` (always recomputed from current BPM)

---

## UI and behaviour

**Fonts and colours:** Share Tech Mono (monospace) and Barlow (body). Amber #f5c842 — current exercise, title, Start button. Orange #ff4500 — count-in beats, active beat dot. White — beat 1 dot. Background #0f0f0f, display zone #1a1a1a.

- Single unified controls grid — no section divider; 3-col on tablet/desktop, 2-col on mobile
- Control order (left to right, top to bottom): Mode (full-width), BPM + Time sig (share a row on mobile via `bpm-timesig-row`; split to separate cells on desktop via `display: contents`), Count in, Exercise length, Exercises, Rounds Per Exercise. In Metronome mode: Mode, BPM + Time sig, Count in (Exercise length/Exercises/Rounds Per Exercise hidden).
- Subdivision is not a grid control — it lives inside the Vol popup. Tap a subdivision icon row to activate it (sets `subdivision` state); tap again to deactivate (sets `subdivision` back to 1).
- Exercise length, Time sig, and Count in use CompactSelector — a button that opens a popup with options; rendered via React portal into document.body to avoid overflow clipping
- Count in popup includes "count in every exercise" checkbox (hidden entirely in Metronome mode, not just disabled); button shows ✓ when active
- No dimming of fixed controls — all controls same visual weight
- Transport buttons: Pause, Loop, Stop, Vol — consistent dark fill base, amber for active Loop, white for active Pause, red-tinted for Stop. In Metronome mode, Pause and Loop are hidden — Stop fills the full transport bar width
- Vol button always shows a subdivision note icon badge (♩ when subdivision=1, ♪♪/♬/⋮ when active). Opens a portal-rendered popup with: Master slider always visible; ♪♪/♬/⋮ rows always visible — tap icon to activate/deactivate subdivision, slider controls that subdivision's volume. Inactive rows are heavily dimmed (opacity 0.18). When subdivision=4 (16ths), both ♪♪ and ♬ rows are at full brightness: ♪♪ slider controls `subdivVol` (8th positions within the 16th pattern), ♬ slider controls `subdivVol2` (pure 16th positions). Triplets (⋮) use `subdivVol3` independently. Row order: ♪♪ → ♬ → ⋮. Each slider has −/+ nudge buttons with hold-to-repeat. Defaults: Master 1.0, subdivisions 0.7.
- Start button amber filled, only visible when idle
- Header: invisible spacer left, title centre, `☰` menu button right — no separate `?` button; "How to use" is the first item in the ☰ menu
- Idle state shows a one-line summary of current settings including sets suffix when sets ≠ 1 (e.g. "shuffle ×2", "sequence ∞")
- Terminology: "Rounds Per Exercise" not "repetitions" or "rounds", "Exercises" not "Range", "Stop" not "Reset", "Metronome" not "Click Only"
- Count-in is always on — no off option; lengths are 1, 2, or 4 bars; optional "count in every exercise" checkbox (hidden in Metronome mode)
- All controls 44px minimum height
- Responsive layout for iPhone, iPad portrait, iPad landscape, Mac — iPad uses (hover: none) and (pointer: coarse) and (min-width: 768px) media queries. **Caveat:** newer iPads may not match `(pointer: coarse)` — use `(min-width: 768px) and (max-width: 1024px) and (orientation: portrait/landscape)` for iPad-specific layout rules rather than relying on pointer/hover conditions
- Version number in footer, incremented with each meaningful update
- Exercises control has two modes: Range (min–max with swipe-to-adjust and tap-to-numpad) and Pick (select specific exercise numbers via BarPickerPopup); toggled via Range/Pick buttons
- EX_MAX is 200; exercise numbers are formatted as two digits with leading zero (fmt())
- A `☰` menu button sits in the header (right side, balanced by an invisible spacer on the left); opens a dropdown with four items: **How to use** (opens the help overlay; closes the menu since the overlay covers it), **Letter mode** (toggle pill; menu stays open), **Share settings** (copies a URL encoding all current settings to the clipboard; menu stays open with an inline amber ✓ for ~1.5s on success, red ✗ on clipboard failure), and **Reset to defaults** (menu stays open with an inline red ✓ for ~1.5s; also fires a "Settings reset" toast). Reset stops the player and restores all settings to defaults — but does NOT reset `metSound` (click sound), which is a device-level preference. **Share settings** also does not include `metSound`. The menu is closed by tapping outside it or tapping the header `☰` again. Hidden when student is sharing in Watch mode. The toggle pill styling is shared with the watch teacher menu via `.menu-toggle-pill` in `src/styles.css`.
- Letter mode displays exercises as A–Z instead of numbers; toggled via the `☰` menu; limited to 26 exercises (EX_MAX_LETTERS); persisted to localStorage
- Idle summary shows picked exercises as a comma list up to 4, then switches to "N exercises" beyond that; range mode uses "X-bar ex" (not "exercise") to save space
- useSwipeInput must call e.preventDefault() in onTouchStart — without it, iOS PWA mode focuses the input and shifts the viewport, causing a persistent touch coordinate offset across the whole app

---

## Version management and commit messages

After all changes are complete, ask: "What's changed since the last deployed version?" Then update the version number in the file and present the version number and commit message together before committing.

Version numbering:
- Major feature additions (new modes, significant functionality): increment minor version (1.3.x → 1.4.0)
- Bug fixes, refinements, UI polish: increment patch version (1.4.0 → 1.4.1)

Development builds (dev branch):
- All new development happens in `src/` files on the `dev` branch
- Version number lives in the footer JSX in `src/components/App.jsx`
- Use the next target version with a beta suffix while in development: if live is v1.5.33 and the next version will be v1.5.34, use v1.5.34.beta.1, v1.5.34.beta.2, etc.
- Increment the beta suffix with each meaningful change on dev — always before committing, never after
- The footer version in `src/components/App.jsx` must match the commit message version. Never commit with a stale version number.
- Never change the version to a release number until the PR is being merged to main

After shipping (merging dev → main):
- Immediately bump `src/components/App.jsx` version to the next beta (e.g. if you just shipped v1.8.2, set it to v1.8.3.beta.1)
- Also update the watch version string in `build.py` to match the new main app version and run `python3 build.py`. If the main app minor version changed (e.g. v1.9.x → v1.10.0), reset the watch number to 1.0 (e.g. `v1.10.0 · watch 1.0`). If only the patch changed, just update the main app part (e.g. `v1.10.0 · watch 2.3` → `v1.10.1 · watch 2.3`).
- At the start of any new session, confirm the version in `src/components/App.jsx` is already on a beta ahead of the live version

Commit message format:
vX.X.X - Brief summary of main change

- Specific change
- Specific change
- Specific change

Only describe changes since the last deployed version. Keep it to 3–5 bullets.

Pull request format:
- Title: `vX.X.X - Brief summary`
- Body: Summary bullets only — no test plan section

---

## Watch feature (shuffleclick.com/watch/)

A private teacher/student session observation tool. Not part of the public app — not linked from anywhere in the main app.

### What it does
- Student opens `shuffleclick.com/watch/` → taps "Share my session" → gets a two-word code (e.g. `BIRD-BOAT`) → share screen shows code and waits
- When teacher connects, student's share screen shows green "Teacher connected" message → student taps "Open Shuffle" → this tap unlocks the iOS Web Audio context (required by iOS before any audio can play) and transitions to the app; the settings controls grid is hidden while sharing (minimal glanceable view: exercise number, beat dots, bar progress, segmented status bar showing BPM/count-in/exercises/rounds/mode, Pause/Loop buttons only — Stop is hidden, teacher controls stopping)
- Teacher opens `shuffleclick.com/watch/` on their device → taps "Watch a session" → enters the code → sees a live view of the student's session and can control all settings and transport (BPM, mode, time sig, count-in, exercise length, exercises, rounds, start/pause/loop/stop)
- In the teacher view: an **End session** button in the watching banner ends the session and disconnects both devices. A `☰` menu button in the watching banner (left side) opens a menu with three items: **Turn letter mode on/off** (toggles letter mode and sends the change to the student); **Share settings** (copies a summary string + `shuffleclick.com/?bpm=...` URL to the clipboard, matching the main app's Share settings format); **Reset to defaults** (sends `tcmd: "stop"` plus all default values to the student). All menu actions use direct `onClick` handlers for iOS clipboard compatibility — no long-press.
- When the student taps "Share my session", settings reset to defaults (BPM 80, 4/4, 1-bar count-in, exercises 1–4, shuffle mode, range mode) so each session starts clean
- Sessions auto-delete from Firebase when the student closes or navigates away
- Student session auto-ends after 30 minutes of inactivity (no teacher commands received); resets on any teacher command
- Teacher session auto-disconnects after 30 minutes of inactivity
- **Audio context:** The student must tap "Open Shuffle" before the teacher starts — this is the required user gesture to unlock the Web Audio context on all platforms. On tap, `getCtx()` (exposed from `useDrumTimer` and destructured directly in `src/components/App.jsx`) creates the AudioContext, resumes it, and starts a looping near-silent buffer (`watchSilentLoop` ref) to keep the context alive. The AudioContext is never closed while the student is sharing (`keepCtxAlive: watchScreen === "app"` is passed to `useDrumTimer`) — this means the context unlocked by the "Open Shuffle" tap stays usable for every subsequent teacher Start without needing a new user gesture. **Screen lock caveat:** if the student manually locks the screen mid-session, iOS suspends the audio session in a way that `ctx.resume()` cannot reliably fix without a new user gesture — the session will hang on beat 1 of the next count-in. A screen wake lock is held in student view to prevent auto-lock, but manual lock cannot be prevented. Recovery requires reloading the browser on both devices. If the teacher starts before the student taps, the metronome will hang silently. The green "Teacher connected" prompt exists specifically to prompt this tap. **Critical:** `getCtx` must remain in the `useDrumTimer` destructure at the top of `App` in `src/components/App.jsx`. It's used both by the "Open Shuffle" handler (watch unlock) and by the click-sound preview in the `☰` menu. If the destructure is ever reduced and drops `getCtx`, both will silently fail — `try/catch` swallows the ReferenceError, the AudioContext is never unlocked, and teacher Start hangs every time. `build.py` section 6b is now a documentation-only comment (no patch) reminding future maintainers of this.
- **`useDrumTimer` signature is matched verbatim by the `src.replace()` patch in `build.py` section 6c** — it matches the exact parameter list of `useDrumTimer`'s call site to inject `keepCtxAlive`. If you add, remove, or rename any parameter in `useDrumTimer` in `src/useDrumTimer.js`, you **must** update the matching strings in `build.py` at the same time, or the patch will silently fail and the watch app will show a black screen. After any such change, run `python3 build.py` and verify `watch/index.html` contains `keepCtxAlive` in both the function signature and the call site.
- **Teacher commands use `.set()` not `.update()`** — cmds are always written as a complete replacement. Using `.update()` would merge with previous cmds, causing old setting fields (BPM, mode, etc.) to be re-applied when a transport command (start/stop) arrives, disrupting the scheduler.
- **ObserverDisplay prop wrappers must resolve updater functions** — `BpmAutoPopup` (and other components) may call state setters with React updater functions (e.g. `setBpmAuto(v => !v)`). The observer wrappers in `build.py` that forward these values to `onSendCmd` must resolve functions to concrete values before sending to Firebase — Firebase `.set()` rejects function arguments silently. Pattern: `const val = typeof v === 'function' ? v(currentState) : v; onSendCmd({ field: val });`

### Teacher Audio

Teacher Audio is a toggle in the teacher's ☰ menu (persisted to `localStorage` key `shuffle_watch_teacherAudio`) that flips who produces the metronome sound.
- **OFF:** the student's `useDrumTimer` plays audio; teacher is display-only.
- **ON:** student is silenced via `studentAudioMuted` (set by `audioMuted` cmd from teacher → zeroes `volume` at the student's `useDrumTimer` call site). A second `useDrumTimer` instance inside `ObserverDisplay` plays on the teacher's device, driven by local state: `teacherRunning`, `teacherPaused`, `teacherResuming`, `teacherLooping`. `keepCtxAlive: teacherAudio` keeps the teacher AudioContext alive.

Either device can initiate Start / Pause / Loop. Both paths must end up with the teacher scheduler and the student scheduler in the same transport state.

**Invariant — teacher handlers must set local state synchronously with the cmd.** Teacher-initiated Start/Pause/Resume/Loop handlers (in `build.py` around the Start/Pause/Stop button `onClick` handlers in `ObserverDisplay`) must set `teacherRunning / teacherPaused / teacherResuming / teacherLooping` in the same React render tick as they fire the Firebase cmd. This is what keeps the student-echo sync effects below from interfering with teacher-initiated transport.

**Invariant — student-echo sync effects must be guarded so teacher-initiated roundtrips are no-ops.** Three `useEffect`s in `ObserverDisplay` mirror `obsRunning / obsPaused / obsLooping` onto the teacher scheduler so student-initiated taps are reflected on the teacher. They must be guarded:
- Start effect guards on `teacherRunning` already being true (teacher already kicked it off locally → no-op).
- Pause / Loop effects guard on value equality (`obsPaused === teacherPaused`, `obsLooping === teacherLooping`).

Without these guards, teacher-initiated Start echoes back through the roundtrip, the effect re-fires, and either clobbers `teacherPaused/Resuming/Looping` mid-count-in or double-sends `audioMuted`. That was the watch 1.11 regression; watch 1.12 reverted the unguarded effects; watch 1.14 reintroduced them with the guards above.

**Student-initiated Start must NOT send `tcmd: "start"`** — only `{ audioMuted: true, tseq }`. The student is already running locally from its own tap; re-sending `tcmd:"start"` would bump `lastTSeq.current` on the student and retrigger its start branch (clobbering `exercise`/`setComplete`/`elapsed` refs that are already correct).

### Version numbering
The watch app has its own version number displayed on the home screen (e.g. `v1.10.0 · watch 1.2`). The first part **must always match the current live main app version** — update it whenever the main app version changes. The watch number resets to 1.0 whenever the main app minor version bumps (e.g. v1.9.x → v1.10.0), and increments independently within a minor version (1.0, 1.1, 1.2, …). **Update both parts of the watch version string in `build.py` every time any watch-related change is made** (the string is in the home screen JSX near the bottom of the watch_jsx block). This must be done even when the change is purely in `build.py` — not just when `src/` changes. After updating the version, always run `python3 build.py` to regenerate `watch/index.html`.

### Files
- `watch/index.html` — the watch app. **Do not edit this file directly.** It is generated by `build.py`.
- `watch/shuffle-icon-watch.png` — the watch app icon
- `build.py` — Python script that builds both `beta/index.html` and `watch/index.html` from `src/` in a single pass

### How it's built
`build.py` assembles all `src/` files into a single HTML, writes `beta/index.html` immediately (no patches), then applies watch patches and writes `watch/index.html`. In one pass it always produces both files. The watch patches injected are:
1. Firebase SDK script tags (compat library, Realtime Database)
2. Watch-specific CSS (home/share/watch-entry/observer screens; student minimal view: `.watch-active .controls { display: none }`, segmented status bar, sharing indicator sizing)
3. `src.replace()` patches on student controls — adds `watch-locked` class to control groups and guards on `handleTap`, `incBpm`, `decBpm`, `incBars`, `decBars` to block interaction when `watchScreen === "app"`; hides Stop button and injects segmented status bar (BPM, count-in, exercises, rounds, mode) when sharing
4. Firebase init + `ObserverDisplay` React component (teacher's interactive view)
5. Watch mode state variables in `App` (`watchScreen`, `shareCode`, `observedState`, etc.) and `watchSilentLoop` ref
6. `useEffect` that broadcasts live playback state (including `isResuming`) to Firebase at `sessions/{CODE}/state`
7. Watch handlers (`handleStartSharing`, `handleStopSharing`, `handleConnectWatch`, `handleDisconnectWatch`, `handleSendCmd`)
8. Student command listener — reads teacher commands from `sessions/{CODE}/cmds` and applies them
9. Watch UI overlays wrapping the JSX return (home/share/watch-entry screens; observer view renders instead of the main app when watching)

### Keeping watch in sync with the main app

**CRITICAL RULE: Never edit `beta/index.html` or `watch/index.html` directly** — both are generated files.

- `beta/index.html` and `watch/index.html` are both generated from `src/` by `build.py`
- `beta/index.html` is the unpatched build (beta version string kept); `watch/index.html` has all watch patches applied (beta suffix stripped)

All watch-specific behaviour (student control dimming, teacher UI, Firebase logic) must be implemented as `src.replace()` patches inside `build.py`.

**Python raw strings and unicode escapes:** Several blocks in `build.py` are raw strings (`r"""`), including `firebase_and_observer`. In a raw string, `\u203a` is **not** interpreted as a unicode escape — it is written literally into the output. Always use the actual unicode character (e.g. `›` not `\u203a`) when writing JSX inside a raw string block.

After making changes to `src/` (main app changes), run:
```
python3 build.py
```
Or equivalently: `npm run generate`. The script always regenerates both files — on `dev`, only commit `src/` changes and `beta/index.html`. Never commit `watch/index.html` from `dev` — it is only committed as part of a watch hotfix on a branch off `main`.

For watch-only changes (e.g. teacher UI, Firebase logic), edit `build.py` and run `python3 build.py`. Commit only `build.py`, `beta/index.html`, and `watch/index.html`.

### Teacher view parity

The teacher (`ObserverDisplay` in `build.py`) must mirror every controllable setting in the main app. `python3 build.py` enforces this with hard parity checks — if any are missing the build exits with an error listing exactly what's broken.

**When adding a new setting to the main app**, you must also:
1. Add it to the student state broadcast payload (and deps array) in build.py section 6
2. Add a `cmd.newSetting` handler in the student command listener (section 8)
3. Add a control for it in `ObserverDisplay` — matching the main app's UI pattern (inline control, or ☰ menu item if it's a device-level preference like click sound)
4. Add a parity check token to the `teacher_parity_checks` list at the bottom of `build.py`
5. Run `python3 build.py` — it must exit cleanly with "Done." before committing

The `teacher_parity_checks` list in `build.py` is the authoritative record of what the teacher view covers. Do not maintain a duplicate list here — it will drift.

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
- API key is restricted in Google Cloud Console to HTTP referrers `https://shuffleclick.com/*` and `https://www.shuffleclick.com/*` — rotate key in Cloud Console and update `build.py` if compromised
- Firebase config (including API key) is embedded in `build.py` — if the Firebase project ever changes, update it there
- Local testing: open via `python3 -m http.server 8000` and `http://localhost:8000/watch/` rather than `file://` (API key referrer restriction doesn't cover `file://` origins)

---

## Future: Swift/SwiftUI native app

The long-term plan is to rewrite Shuffle as a native Swift/SwiftUI app for iPhone, iPad, and Mac. The web app is the reference implementation — no changes to the web codebase are needed to prepare for this, but keep the following in mind:

- **Keep business logic separate from React** — pure functions in `src/` that don't depend on hooks or JSX are the easiest to port
- **The audio scheduler comments are intentional** — `src/useDrumTimer.js`, `src/audio.js`, and `src/constants.js` contain block comments explaining the timing model and Swift/AVAudioEngine porting notes. Do not remove or shorten these
- **The Watch feature is planned as a paid unlock** in the native app — keep the watch architecture clean and well-documented for the same reason

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
