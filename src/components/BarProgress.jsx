import { BAR_BLOCKS_MAX } from '../constants.js';

function blockWidth(n) {
  if (n <= 8)  return 20;
  if (n <= 12) return 16;
  return 12;
}

function blockGap(n) {
  return n <= 12 ? 4 : 3;
}

// Amber brightness levels for bar-within-phrase: index = bar position (0-based)
const BAR_PHRASE_COLOURS = {
  1: ["#f5c842"],
  2: ["#7a6421", "#f5c842"],
  4: ["#3d3210", "#7a6421", "#b89631", "#f5c842"],
};

function barPhraseColour(exerciseLength, currentBar) {
  const colours = BAR_PHRASE_COLOURS[exerciseLength] || ["#f5c842"];
  const barWithinPhrase = currentBar % exerciseLength;
  return colours[barWithinPhrase] || "#f5c842";
}

export function BarProgress({ barsPerExercise, currentRound, currentBar, exerciseLength, looping, phase, countInBars, countInBeat, beatsPerBar, barFlash }) {
  if (phase === "idle" || (phase === "countin" && countInBars < 2)) {
    if (barsPerExercise <= BAR_BLOCKS_MAX) {
      const bw = blockWidth(barsPerExercise);
      const bg = blockGap(barsPerExercise);
      return (
        <div className="bar-progress" style={{ gap: `${bg}px` }}>
          {Array.from({ length: barsPerExercise }).map((_, i) => (
            <div key={i} className="bar-block" style={{ width: `${bw}px` }} />
          ))}
        </div>
      );
    } else {
      return (
        <div className="bar-progress-continuous">
          <div className="bar-progress-track">
            <div className="bar-progress-fill" style={{ width: "0%", background: "#f5c842" }} />
          </div>
        </div>
      );
    }
  }

  if (phase === "playing") {
    const activeColour = barPhraseColour(exerciseLength, currentBar);

    if (barsPerExercise <= BAR_BLOCKS_MAX) {
      const bw = blockWidth(barsPerExercise);
      const bg = blockGap(barsPerExercise);
      return (
        <div className="bar-progress" style={{ gap: `${bg}px` }}>
          {Array.from({ length: barsPerExercise }).map((_, i) => (
            <div key={i}
              className={`bar-block${i < currentRound - 1 ? " done" : ""}`}
              style={{
                width: `${bw}px`,
                background: i < currentRound - 1 ? undefined : i === currentRound - 1 ? activeColour : undefined,
              }}
            />
          ))}
        </div>
      );
    } else {
      const pct = Math.min(100, Math.round((currentRound / barsPerExercise) * 100));
      const nearEnd = !looping && currentRound >= barsPerExercise - 1;
      const fillOpacity = barFlash ? 1 : 0.6;
      return (
        <div className="bar-progress-continuous">
          <div className="bar-progress-track">
            <div className="bar-progress-fill" style={{ width: `${pct}%`, background: "#f5c842", opacity: fillOpacity, transition: barFlash ? "none" : "width 0.15s, opacity 0.25s" }} />
          </div>
          <span className={`bar-progress-counter${nearEnd ? " near-end" : ""}`}>
            {`${currentRound}/${barsPerExercise}`}
          </span>
        </div>
      );
    }
  }

  if (phase === "countin" && countInBars >= 2) {
    const countInBar = countInBeat > 0 ? Math.floor((countInBeat - 1) / beatsPerBar) : 0;
    return (
      <div className="bar-progress">
        {Array.from({ length: countInBars }).map((_, i) => (
          <div key={i}
            className={`bar-block${i < countInBar ? " countin-done" : i === countInBar ? " countin-current" : ""}`}
            style={{ width: "20px" }}
          />
        ))}
      </div>
    );
  }

  return <div style={{ height: "5px" }} />;
}
