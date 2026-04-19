// ─────────────────────────────────────────────────────────────────────────────
// useDrumTimer — lookahead audio scheduler
//
// TIMING ARCHITECTURE
// The scheduler runs on a 25ms setInterval and pre-schedules audio events up to
// 200ms ahead using Web Audio's ctx.currentTime (a monotonic clock maintained by
// the audio thread). This decouples the time-critical audio path from the JS main
// thread: even if JS stalls for a frame, beats are already queued.
//
// Audio events are scheduled with ctx.currentTime precision.
// UI state updates (setCurrentBeat, setCurrentBar, etc.) use setTimeout with a
// delay of (scheduledTime - ctx.currentTime) * 1000 — they fire "as close as
// possible" to the beat, but are never on the real-time audio path.
//
// PHASE FLOW
//   countin → playing → [inter-exercise countin → playing] → ... → set complete
//
// BEAT COUNTERS (three separate, non-overlapping)
//   beatCount       — position within the initial count-in (0 → countInBeats-1)
//   playBeatCount   — position within the playing phase; drives exercise/bar maths
//   countInBeatPos  — position within an inter-exercise count-in; playBeatCount is
//                     paused (reset to 0) while this is active to avoid corrupting
//                     the beat-to-exercise index calculation
//
// SWIFT / AVAUDIOSESSION PORTING NOTES
//   • ctx.currentTime  →  Double(engine.outputNode.lastRenderTime!.sampleTime) / sampleRate
//   • setInterval      →  DispatchSourceTimer on a background queue
//   • setTimeout(fn,d) →  DispatchQueue.main.asyncAfter(deadline: .now() + d/1000)
//   • stoppedRef guard →  capture a cancelled flag in the closure / use Task cancellation
//   • AudioContext never suspends in AVAudioEngine — startSilentLoop is not needed;
//     instead configure AVAudioSession category to .playback for background audio
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SCHEDULER_INTERVAL_MS, LOOKAHEAD_TIME, START_DELAY,
  FLASH_DURATION_MS, RESUME_SETUP_DELAY_MS,
  MODE_FULLSET, MODE_SEQUENTIAL, MODE_CLICKONLY,
} from './constants.js';
import { scheduleWoodblock, scheduleEndBell, scheduleMetronomeClick, startSilentLoop } from './audio.js';

export function useDrumTimer({ bpm, beatsPerBar, barsPerExercise, minEx, maxEx,
                        onNewExercise, onNextExercise, onSetComplete, onSetLoop,
                        running, paused, resuming,
                        countInBars, countInEveryRound,
                        mode, volume, looping, infinite, setComplete,
                        exMode, pickedNums, subdivision, beatStates, subdivVol, subdivVol2, subdivVol3,
                        metSound }) {

  const audioCtx          = useRef(null);
  const silentLoop        = useRef(null);
  const nextBeatTime      = useRef(0);
  const beatCount         = useRef(0);
  const schedulerRef      = useRef(null);
  const lastExercise      = useRef(null);
  const nextExercise      = useRef(null);
  const deckRef           = useRef([]);
  const seqIndex          = useRef(0);
  const exercisesPlayed   = useRef(0);
  const playingBars       = useRef(0);
  const loopingRef        = useRef(looping);
  const infiniteRef       = useRef(infinite);
  const countInProgress   = useRef(false);
  const countInBeatPos    = useRef(0);
  const playBeatCount     = useRef(0);
  const schedulerFn       = useRef(null);
  const setEndPending     = useRef(false);
  const stoppedRef        = useRef(false);
  const wasRunningRef     = useRef(false);

  const [currentBeat,   setCurrentBeat]   = useState(0);
  const [currentBar,    setCurrentBar]    = useState(0);
  const [currentSubdiv, setCurrentSubdiv] = useState(0);
  const [phase,         setPhase]         = useState("idle");
  const [flashOn,       setFlashOn]       = useState(false);
  const [countInBeat,   setCountInBeat]   = useState(0);
  const [isResuming,    setIsResuming]    = useState(false);

  const getCtx = useCallback(() => {
    if (!audioCtx.current)
      audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx.current;
  }, []);

  const buildDeck = useCallback((min, max, avoidFirst) => {
    const arr = [];
    for (let i = min; i <= max; i++) arr.push(i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (avoidFirst != null && arr.length > 1 && arr[0] === avoidFirst) {
      const swap = Math.floor(Math.random() * (arr.length - 1)) + 1;
      [arr[0], arr[swap]] = [arr[swap], arr[0]];
    }
    return arr;
  }, []);

  const buildDeckFromArray = useCallback((arr, avoidFirst) => {
    const deck = [...arr];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    if (avoidFirst != null && deck.length > 1 && deck[0] === avoidFirst) {
      const swap = Math.floor(Math.random() * (deck.length - 1)) + 1;
      [deck[0], deck[swap]] = [deck[swap], deck[0]];
    }
    return deck;
  }, []);

  const pickNext = useCallback((min, max, last, currentMode) => {
    const { exMode: em, pickedNums: pn } = stateRef.current;
    if (em === 'pick' && pn && pn.length > 0) {
      if (currentMode === MODE_FULLSET) {
        if (deckRef.current.length === 0) deckRef.current = buildDeckFromArray(pn, last);
        return deckRef.current.shift();
      } else {
        const ex = pn[seqIndex.current % pn.length];
        seqIndex.current++;
        return ex;
      }
    }
    if (currentMode === MODE_FULLSET) {
      if (deckRef.current.length === 0) deckRef.current = buildDeck(min, max, last);
      return deckRef.current.shift();
    } else {
      const total = max - min + 1;
      const ex = min + (seqIndex.current % total);
      seqIndex.current++;
      return ex;
    }
  }, [buildDeck, buildDeckFromArray]);

  const stateRef = useRef({});
  useEffect(() => {
    stateRef.current = { bpm, beatsPerBar, barsPerExercise, minEx, maxEx,
                         onNewExercise, onNextExercise, onSetComplete, onSetLoop,
                         countInBars, countInEveryRound,
                         mode, volume, exMode, pickedNums, subdivision, beatStates, subdivVol, subdivVol2, subdivVol3,
                         metSound };
  });

  const resumingRef = useRef(false);

  useEffect(() => {
    infiniteRef.current = infinite;
  }, [infinite]);

  useEffect(() => {
    loopingRef.current = looping;
    if (!looping && lastExercise.current !== null) {
      const { onNextExercise: onNext } = stateRef.current;
      if (setEndPending.current) {
        onNext(-1);
      } else if (nextExercise.current !== null) {
        onNext(nextExercise.current);
      }
    }
  }, [looping]);

  useEffect(() => {
    if (!audioCtx.current) return;
    const ctx = audioCtx.current;
    if (paused) {
      clearInterval(schedulerRef.current);
    } else if (resuming) {
      resumingRef.current = true;
      beatCount.current = 0;
      playBeatCount.current = 0;
      countInProgress.current = false;
      countInBeatPos.current = 0;
      nextBeatTime.current = Infinity;
      // Resync playingBars to where we are in the current set so that ∞ set-loop
      // and "last exercise" signals fire correctly after resume.
      // exercisesPlayed is the 1-based count of exercises played so far; subtracting
      // 1 and taking modulo gives position-in-set (0-based), then multiply by bpe to
      // get the bar count the ∞ detection expects.
      {
        const { barsPerExercise: bpe, minEx: mn, maxEx: mx, exMode: em, pickedNums: pn } = stateRef.current;
        const totalInSet = (em === 'pick' && pn && pn.length > 0) ? pn.length : mx - mn + 1;
        const posInSet = (exercisesPlayed.current - 1) % totalInSet;
        playingBars.current = posInSet * bpe;
      }
      setIsResuming(true);
      setPhase("countin");
      const { onNextExercise: onNext } = stateRef.current;
      onNext(lastExercise.current);
      // RESUME_SETUP_DELAY_MS (50ms): AudioContext.resume() is async and the context
      // state may still read "suspended" for a few milliseconds after the call.
      // Delaying the scheduler restart gives it time to settle so nextBeatTime is
      // set against a fully-running clock.
      setTimeout(() => {
        nextBeatTime.current = ctx.currentTime + START_DELAY;
        clearInterval(schedulerRef.current);
        if (schedulerFn.current) {
          schedulerRef.current = setInterval(schedulerFn.current, SCHEDULER_INTERVAL_MS);
        }
      }, RESUME_SETUP_DELAY_MS);
    } else {
      ctx.resume().catch(() => {});
    }
  }, [paused, resuming]);

  // ── Reset on stop ──
  useEffect(() => {
    if (!running) {
      if (wasRunningRef.current) stoppedRef.current = true;
      clearInterval(schedulerRef.current);
      if (silentLoop.current) { try { silentLoop.current.stop(); } catch {} silentLoop.current = null; }
      if (setComplete) {
        setTimeout(() => {
          if (audioCtx.current) { try { audioCtx.current.close(); } catch {} audioCtx.current = null; }
        }, 150);
      } else {
        if (audioCtx.current) { try { audioCtx.current.close(); } catch {} audioCtx.current = null; }
      }
      setPhase("idle");
      setCurrentBeat(0); setCurrentBar(0); setCountInBeat(0); setIsResuming(false);
      beatCount.current = 0; playBeatCount.current = 0; exercisesPlayed.current = 0; playingBars.current = 0;
      lastExercise.current = null; nextExercise.current = null;
      deckRef.current = []; seqIndex.current = 0;
      countInProgress.current = false; countInBeatPos.current = 0;
      resumingRef.current = false; schedulerFn.current = null; setEndPending.current = false;
      nextBeatTime.current = 0;
      wasRunningRef.current = false;
    }
  }, [running, setComplete]);

  // ── Fresh start only ──
  useEffect(() => {
    if (!running || paused || resuming || schedulerFn.current) return;

    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume();
    if (!silentLoop.current) silentLoop.current = startSilentLoop(ctx);

    const { countInBars: cib, minEx: mn, maxEx: mx,
            onNewExercise: cb, onNextExercise: cbNext, mode: m } = stateRef.current;

    beatCount.current = 0; playBeatCount.current = 0;
    // START_DELAY (100ms) gives the scheduler a head start — the first beat is
    // pre-scheduled before the interval even fires for the first time.
    nextBeatTime.current = ctx.currentTime + START_DELAY;
    countInProgress.current = false; countInBeatPos.current = 0;
    resumingRef.current = false; stoppedRef.current = false;
    wasRunningRef.current = true;

    exercisesPlayed.current = 1;
    deckRef.current = []; seqIndex.current = 0;
    setPhase(cib > 0 ? "countin" : "playing");

    if (m === MODE_CLICKONLY) {
      lastExercise.current = 1;
      nextExercise.current = null;
      cb(1);
      cbNext(null);
    } else {
      const firstEx = pickNext(mn, mx, null, m);
      lastExercise.current = firstEx;

      const { exMode: emStart, pickedNums: pnStart } = stateRef.current;
      const totalInSetAtStart = (emStart === 'pick' && pnStart && pnStart.length > 0) ? pnStart.length : mx - mn + 1;
      if ((m === MODE_FULLSET || m === MODE_SEQUENTIAL) && totalInSetAtStart === 1) {
        nextExercise.current = firstEx;
        setEndPending.current = true;
        cbNext(firstEx);
      } else {
        const secondEx = pickNext(mn, mx, firstEx, m);
        nextExercise.current = secondEx;
        cbNext(firstEx);
      }
    }

    const scheduler = () => {
      const { bpm: b, beatsPerBar: bpb2, barsPerExercise: bpe,
              minEx: min, maxEx: max,
              onNewExercise: onChange, onNextExercise: onNext,
              onSetComplete: onDone, onSetLoop: onLoop,
              countInBars: cib2, countInEveryRound: cier,
              mode: currentMode, volume: vol, metSound: mSound } = stateRef.current;

      const beatLen           = 60 / b;
      const countInBeats      = bpb2 * cib2;
      // interCountInBeats is always 0 in Metronome mode — countInEveryRound persists
      // in state when switching modes, but inter-exercise count-ins don't exist in
      // Metronome mode. Zeroing it here keeps all downstream logic correct without
      // requiring per-use-site guards.
      const interCountInBeats = (cier && currentMode !== MODE_CLICKONLY) ? bpb2 * cib2 : 0;
      const { exMode: em, pickedNums: pn } = stateRef.current;
      const totalInSet        = (em === 'pick' && pn && pn.length > 0) ? pn.length : max - min + 1;

      // Core lookahead loop: on each 25ms tick, schedule every beat that falls
      // within the next 200ms. Usually this is 0–2 beats; at very high BPMs it
      // may be more. nextBeatTime advances by one beatLen each iteration and the
      // loop exits as soon as the next beat is outside the window.
      while (nextBeatTime.current < ctx.currentTime + LOOKAHEAD_TIME) {
        const bc = beatCount.current;

        // ── Phase 1: initial count-in (beatCount 0 → countInBeats-1) ──
        if (bc < countInBeats) {
          const beatInCI = bc % bpb2;
          scheduleWoodblock(ctx, nextBeatTime.current, beatInCI === 0, vol, mSound);
          { const { subdivision: ciSd, subdivVol: ciSv = 1, subdivVol2: ciSv2 = 1, subdivVol3: ciSv3 = 1, subdivCountIn: ciOn = true } = stateRef.current;
            if (ciSd > 1 && ciOn) { const ciSdLen = (60 / b) / ciSd; for (let s = 1; s < ciSd; s++) { const sm = ciSd === 3 ? ciSv3 : (ciSd === 4 && s % 2 !== 0) ? ciSv2 : ciSv; scheduleWoodblock(ctx, nextBeatTime.current + ciSdLen * s, false, vol * sm, mSound, true); } } }
          const t = nextBeatTime.current;
          // stoppedRef guard: the user may hit Stop between scheduling this beat
          // and the setTimeout firing. Without the guard, stale state updates would
          // execute after the scheduler resets, corrupting the next run's initial state.
          setTimeout(() => { if (stoppedRef.current) return; setCountInBeat(bc + 1); setPhase("countin"); },
            Math.max(0, (t - ctx.currentTime) * 1000));
          if (bc === countInBeats - 1) {
            const cur = lastExercise.current;
            const nxt = setEndPending.current ? -1 : nextExercise.current;
            setTimeout(() => {
              if (stoppedRef.current) return;
              onChange(cur);
              onNext(nxt);
              setPhase("playing");
              setIsResuming(false);
              resumingRef.current = false;
            }, Math.max(0, (t - ctx.currentTime) * 1000 + beatLen * 1000));
          }

        } else {
          // ── Phase 2: playing (and inter-exercise count-ins) ──
          const inInterCountIn = countInProgress.current;

          // Inter-exercise count-in: playBeatCount is paused (reset to 0) while this
          // runs so it doesn't advance through the exercise/bar index maths. Only
          // countInBeatPos increments here, then countInProgress is cleared and the
          // playing phase resumes from playBeatCount = 0 (the new exercise's beat 1).
          if (inInterCountIn) {
            const interPos = countInBeatPos.current;
            scheduleWoodblock(ctx, nextBeatTime.current, interPos % bpb2 === 0, vol, mSound);
            { const { subdivision: ciSd, subdivVol: ciSv = 1, subdivVol2: ciSv2 = 1, subdivVol3: ciSv3 = 1, subdivCountIn: ciOn = true } = stateRef.current;
              if (ciSd > 1 && ciOn) { const ciSdLen = (60 / b) / ciSd; for (let s = 1; s < ciSd; s++) { const sm = ciSd === 3 ? ciSv3 : (ciSd === 4 && s % 2 !== 0) ? ciSv2 : ciSv; scheduleWoodblock(ctx, nextBeatTime.current + ciSdLen * s, false, vol * sm, mSound, true); } } }
            const t = nextBeatTime.current;
            setTimeout(() => { if (stoppedRef.current) return; setCountInBeat(interPos + 1); setPhase("countin"); },
              Math.max(0, (t - ctx.currentTime) * 1000));
            countInBeatPos.current++;
            if (countInBeatPos.current >= interCountInBeats) {
              countInProgress.current = false; countInBeatPos.current = 0;
              const upcoming = nextExercise.current;
              const t2 = nextBeatTime.current;
              setTimeout(() => { if (stoppedRef.current) return; onNext(upcoming); setPhase("playing"); },
                Math.max(0, (t2 - ctx.currentTime) * 1000 + beatLen * 1000));
            }

          } else {
            const playBeat      = playBeatCount.current;
            const beatInBar     = playBeat % bpb2;
            const barInExercise = Math.floor(playBeat / bpb2) % bpe;
            const isNewExercise = playBeat > 0 && beatInBar === 0 && barInExercise === 0;
            const isDownbeat    = beatInBar === 0;

            if (!(isNewExercise && setEndPending.current && !loopingRef.current)) {
              const { subdivision: subdiv, beatStates: bStates, mode: clickMode, subdivVol: sVol = 1, subdivVol2: sVol2 = 1, subdivVol3: sVol3 = 1 } = stateRef.current;
              const beatState = (clickMode === MODE_CLICKONLY && bStates && bStates[beatInBar] != null)
                ? bStates[beatInBar]
                : (isDownbeat ? 'accent' : 'normal');
              if (!(isNewExercise && interCountInBeats > 0)) scheduleMetronomeClick(ctx, nextBeatTime.current, beatState, vol, false, mSound);
              if (subdiv > 1 && !(isNewExercise && interCountInBeats > 0)) {
                const subdivLen = (60 / b) / subdiv;
                for (let s = 1; s < subdiv; s++) {
                  // subdiv=3 (triplets): use sVol3. subdiv=4 (16ths): s=2 is 8th position (sVol), s=1,3 are pure 16ths (sVol2). subdiv=2 (8ths): sVol.
                  const subMul = subdiv === 3 ? sVol3 : (subdiv === 4 && s % 2 !== 0) ? sVol2 : sVol;
                  scheduleMetronomeClick(ctx, nextBeatTime.current + subdivLen * s, 'normal', vol * subMul, true, mSound);
                  const tSub = nextBeatTime.current + subdivLen * s;
                  setTimeout(() => {
                    if (stoppedRef.current) return;
                    setCurrentSubdiv(s);
                  }, Math.max(0, (tSub - ctx.currentTime) * 1000));
                }
              }
            }
            const t = nextBeatTime.current;
            setTimeout(() => {
              if (stoppedRef.current) return;
              setCurrentBeat(beatInBar);
              setCurrentSubdiv(0);
              setCurrentBar(barInExercise);
              if (currentMode !== MODE_CLICKONLY && isDownbeat && barInExercise === 0 && playBeat > 0) {
                setFlashOn(true);
                setTimeout(() => setFlashOn(false), FLASH_DURATION_MS);
              }
            }, Math.max(0, (t - ctx.currentTime) * 1000));

            // ∞ set-loop detection: increment playingBars on every downbeat (except
            // the very first, playBeat > 0 guard) and fire onLoop when the bar count
            // is an exact multiple of totalBarsPerSet (all exercises × barsPerExercise).
            // The "last exercise" signal fires one full exercise early (totalBarsPerSet - bpe)
            // so the UI has time to update the "next exercise" label before it arrives.
            if (currentMode !== MODE_CLICKONLY && infiniteRef.current && isDownbeat && playBeat > 0 && onLoop) {
              playingBars.current++;
              const totalBarsPerSet = totalInSet * bpe;
              if (playingBars.current % totalBarsPerSet === 0) {
                const t2 = t;
                exercisesPlayed.current = 0;
                setTimeout(() => { if (stoppedRef.current) return; onLoop(); }, Math.max(0, (t2 - ctx.currentTime) * 1000));
              }
              if (totalInSet > 1 && playingBars.current % totalBarsPerSet === totalBarsPerSet - bpe) {
                const t2 = t;
                setTimeout(() => { if (stoppedRef.current) return; onNext(-1); }, Math.max(0, (t2 - ctx.currentTime) * 1000));
              }
            }

            if (currentMode === MODE_CLICKONLY) {
              if (isDownbeat && playBeat > 0) {
                const newBarCount = lastExercise.current + 1;
                lastExercise.current = newBarCount;
                setTimeout(() => { if (stoppedRef.current) return; onChange(newBarCount); }, Math.max(0, (t - ctx.currentTime) * 1000));
              }
              playBeatCount.current++;
            } else if (isNewExercise) {
              if (setEndPending.current) {
                if (loopingRef.current) {
                  const current = lastExercise.current;
                  setTimeout(() => { if (stoppedRef.current) return; onChange(current); }, Math.max(0, (t - ctx.currentTime) * 1000));
                  playBeatCount.current = 1;
                } else {
                  clearInterval(schedulerRef.current);
                  scheduleEndBell(ctx, nextBeatTime.current, vol);
                  const t2 = t;
                  setTimeout(() => { if (stoppedRef.current) return; onDone(); }, Math.max(0, (t2 - ctx.currentTime) * 1000));
                  setEndPending.current = false;
                }
              } else if (loopingRef.current) {
                const current = lastExercise.current;
                setTimeout(() => { if (stoppedRef.current) return; onChange(current); }, Math.max(0, (t - ctx.currentTime) * 1000));
                playBeatCount.current = 1;
              } else {
                const isShuffleSeq = currentMode === MODE_FULLSET || currentMode === MODE_SEQUENTIAL;
                const setFinished = isShuffleSeq && exercisesPlayed.current >= totalInSet - 1;
                const setDone = setFinished && !infiniteRef.current;

                if (setDone) {
                  const incoming = nextExercise.current;
                  lastExercise.current = incoming;
                  setEndPending.current = true;

                  if (interCountInBeats > 0) {
                    nextExercise.current = -1;
                    setTimeout(() => { if (stoppedRef.current) return; onChange(incoming); onNext(-1); setPhase("countin"); setCountInBeat(1); },
                      Math.max(0, (t - ctx.currentTime) * 1000));
                    countInProgress.current = true;
                    countInBeatPos.current = 1;
                    playBeatCount.current = 0;
                    scheduleWoodblock(ctx, nextBeatTime.current, true, vol, mSound);
                    { const { subdivision: ciSd, subdivVol: ciSv = 1, subdivVol2: ciSv2 = 1, subdivVol3: ciSv3 = 1 } = stateRef.current;
                      if (ciSd > 1) { const ciSdLen = (60 / b) / ciSd; for (let s = 1; s < ciSd; s++) { const sm = ciSd === 3 ? ciSv3 : (ciSd === 4 && s % 2 !== 0) ? ciSv2 : ciSv; scheduleWoodblock(ctx, nextBeatTime.current + ciSdLen * s, false, vol * sm, mSound, true); } } }
                    if (countInBeatPos.current >= interCountInBeats) {
                      countInProgress.current = false; countInBeatPos.current = 0;
                      setTimeout(() => { if (stoppedRef.current) return; setPhase("playing"); },
                        Math.max(0, (t - ctx.currentTime) * 1000 + beatLen * 1000));
                    }
                  } else {
                    const t2 = t;
                    setTimeout(() => {
                      if (stoppedRef.current) return;
                      onChange(incoming);
                      onNext(-1);
                    }, Math.max(0, (t2 - ctx.currentTime) * 1000));
                    playBeatCount.current = 1;
                  }
                } else {
                  exercisesPlayed.current++;
                  const incoming = nextExercise.current;
                  lastExercise.current = incoming;

                  const upcoming = pickNext(min, max, incoming, currentMode);
                  nextExercise.current = upcoming;

                  if (interCountInBeats > 0) {
                    setTimeout(() => { if (stoppedRef.current) return; onChange(incoming); onNext(incoming); setPhase("countin"); setCountInBeat(1); },
                      Math.max(0, (t - ctx.currentTime) * 1000));
                    countInProgress.current = true;
                    countInBeatPos.current = 1;
                    playBeatCount.current = 0;
                    scheduleWoodblock(ctx, nextBeatTime.current, true, vol, mSound);
                    { const { subdivision: ciSd, subdivVol: ciSv = 1, subdivVol2: ciSv2 = 1, subdivVol3: ciSv3 = 1 } = stateRef.current;
                      if (ciSd > 1) { const ciSdLen = (60 / b) / ciSd; for (let s = 1; s < ciSd; s++) { const sm = ciSd === 3 ? ciSv3 : (ciSd === 4 && s % 2 !== 0) ? ciSv2 : ciSv; scheduleWoodblock(ctx, nextBeatTime.current + ciSdLen * s, false, vol * sm, mSound, true); } } }
                    if (countInBeatPos.current >= interCountInBeats) {
                      countInProgress.current = false; countInBeatPos.current = 0;
                      setTimeout(() => { if (stoppedRef.current) return; onNext(upcoming); setPhase("playing"); },
                        Math.max(0, (t - ctx.currentTime) * 1000 + beatLen * 1000));
                    }
                  } else {
                    playBeatCount.current = 1;
                    setTimeout(() => { if (stoppedRef.current) return; onChange(incoming); onNext(upcoming); },
                      Math.max(0, (t - ctx.currentTime) * 1000));
                  }
                }
              }
            } else {
              playBeatCount.current++;
            }
          }
        }

        beatCount.current++;
        nextBeatTime.current += beatLen;
      }
    };

    schedulerFn.current = scheduler;
    schedulerRef.current = setInterval(scheduler, SCHEDULER_INTERVAL_MS);
    return () => clearInterval(schedulerRef.current);
  }, [running, getCtx, pickNext]);

  return { currentBeat, currentBar, currentSubdiv, phase, flashOn, countInBeat, isResuming, getCtx };
}
