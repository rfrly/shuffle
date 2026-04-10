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
                        exMode, pickedNums, subdivision, beatStates }) {

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
                         mode, volume, exMode, pickedNums, subdivision, beatStates };
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
      setIsResuming(true);
      setPhase("countin");
      const { onNextExercise: onNext } = stateRef.current;
      onNext(lastExercise.current);
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
    nextBeatTime.current = ctx.currentTime + START_DELAY;
    countInProgress.current = false; countInBeatPos.current = 0;
    resumingRef.current = false; stoppedRef.current = false;
    wasRunningRef.current = true;

    exercisesPlayed.current = 1;
    deckRef.current = []; seqIndex.current = 0;
    setPhase("countin");

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
              mode: currentMode, volume: vol } = stateRef.current;

      const beatLen           = 60 / b;
      const countInBeats      = bpb2 * cib2;
      const interCountInBeats = cier ? bpb2 * cib2 : 0;
      const { exMode: em, pickedNums: pn } = stateRef.current;
      const totalInSet        = (em === 'pick' && pn && pn.length > 0) ? pn.length : max - min + 1;

      while (nextBeatTime.current < ctx.currentTime + LOOKAHEAD_TIME) {
        const bc = beatCount.current;

        if (bc < countInBeats) {
          const beatInCI = bc % bpb2;
          scheduleWoodblock(ctx, nextBeatTime.current, beatInCI === 0, vol);
          const t = nextBeatTime.current;
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
          const inInterCountIn = countInProgress.current;

          if (inInterCountIn) {
            const interPos = countInBeatPos.current;
            scheduleWoodblock(ctx, nextBeatTime.current, interPos % bpb2 === 0, vol);
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
              const { subdivision: subdiv, beatStates: bStates, mode: clickMode } = stateRef.current;
              const beatState = (clickMode === MODE_CLICKONLY && bStates && bStates[beatInBar] != null)
                ? bStates[beatInBar]
                : (isDownbeat ? 'accent' : 'normal');
              scheduleMetronomeClick(ctx, nextBeatTime.current, beatState, vol, false);
              if (clickMode === MODE_CLICKONLY && subdiv > 1) {
                const subdivLen = (60 / b) / subdiv;
                for (let s = 1; s < subdiv; s++) {
                  scheduleMetronomeClick(ctx, nextBeatTime.current + subdivLen * s, 'normal', vol, true);
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

            // ∞ set-loop detection: count playing bars, fire onLoop every totalBarsPerSet bars
            if (currentMode !== MODE_CLICKONLY && infiniteRef.current && isDownbeat && playBeat > 0 && onLoop) {
              playingBars.current++;
              const totalBarsPerSet = totalInSet * bpe;
              if (playingBars.current % totalBarsPerSet === 0) {
                const t2 = t;
                setTimeout(() => { if (stoppedRef.current) return; onLoop(); }, Math.max(0, (t2 - ctx.currentTime) * 1000));
              }
              // Signal last exercise of the set so UI can show "last exercise"
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
                    scheduleWoodblock(ctx, nextBeatTime.current, true, vol);
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
                    scheduleWoodblock(ctx, nextBeatTime.current, true, vol);
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
