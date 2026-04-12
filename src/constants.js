export const TIME_SIGS = [
  { label: "2/4", beats: 2 },
  { label: "3/4", beats: 3 },
  { label: "4/4", beats: 4 },
  { label: "5/4", beats: 5 },
  { label: "6/4", beats: 6 },
  { label: "7/4", beats: 7 },
];

export const MODE_FULLSET    = "fullset";
export const MODE_SEQUENTIAL = "sequential";
export const MODE_CLICKONLY  = "clickonly";

export const STORAGE_KEY = "shuffle_settings_v7";

// Lookahead scheduler timing: the scheduler fires every 25ms and pre-schedules
// any beats falling within the next 200ms window. The 175ms gap between them is
// the safety margin — audio events are committed well before they're needed, so
// the audio thread never has to wait on the JS main thread.
// Swift/AVAudioEngine port: replace ctx.currentTime with sampleTime / sampleRate,
// and replace setInterval with a DispatchSourceTimer on a background queue.
export const SCHEDULER_INTERVAL_MS   = 25;
export const LOOKAHEAD_TIME          = 0.2;
// Initial offset before the first beat — buys a scheduling buffer at start/resume
// so the first beat is never missed even if JS startup takes a few milliseconds.
export const START_DELAY             = 0.1;
export const FLASH_DURATION_MS       = 200;
export const SET_COMPLETE_DISPLAY_MS = 2000;
export const RESUME_SETUP_DELAY_MS   = 50;
export const BPM_MIN                 = 30;
export const BPM_MAX                 = 300;
export const BARS_MIN                = 1;
export const BARS_MAX                = 32;
export const EX_MIN                  = 1;
export const EX_MAX                  = 200;
export const EX_MAX_LETTERS          = 26;
export const TAP_MAX_HISTORY         = 8;
export const TAP_RESET_MS            = 2000;
export const BAR_BLOCKS_MAX          = 16;  // above this threshold, use progress bar
