// Numeric constants for the sailing model — ported verbatim from the verified
// design spec (docs/sailing-spec.md §0–§12). Conventions, in one place:
//   heading: 0 = up/north (+Y), clockwise, [0,360)
//   windDir: bearing the wind blows FROM (0 = from the north)
//   sheet:   1 = sheeted IN, 0 = eased OUT
//   tiller:  -1 = push to port, +1 = push to starboard  (bow turns the OTHER way)

export const DEG2RAD = Math.PI / 180;
export const KT_TO_MS = 0.514;

// Wind
export const TWS_DEFAULT = 12; // knots
export const WIND_REF = 12;
export const WIND_FACTOR_EXP = 0.6;
export const WIND_FACTOR_MIN = 0.4;
export const WIND_FACTOR_MAX = 1.25;

// No-go / points of sail
export const NO_GO_HALF = 43; // degrees
export const GYBE_ZONE = 170;
export const HEAD_TO_WIND_DEADBAND = 3;

// Steering (the inverted tiller)
export const MAX_TURN_RATE = 70; // deg/s
export const SPEED_FULL_AUTHORITY = 4; // kt
export const SPEED_MIN_STEERAGE = 0.6; // kt
export const AUTHORITY_CURVE_EXP = 0.5;
export const REVERSE_AUTHORITY_REF = 0.4; // kt

// Speed model
export const HULL_MAX_KT = 6;
export const ACCEL_TAU = 2.8; // s
export const DECEL_TAU = 1.4; // s
export const IRONS_STERNWAY_MAX = -0.4; // kt
export const STERNWAY_TRIGGER_SPEED = 0.3; // kt

// Speed polar: true wind angle (deg) -> speed multiplier [0,1]
export const POLAR: readonly (readonly [number, number])[] = [
  [0, 0],
  [15, 0],
  [30, 0.02],
  [43, 0.05],
  [45, 0.45],
  [60, 0.78],
  [75, 0.92],
  [90, 1],
  [105, 1],
  [120, 0.97],
  [135, 0.88],
  [150, 0.74],
  [165, 0.66],
  [180, 0.62],
];

// Sail trim
export const BOOM_MIN = 5; // deg off centreline
export const BOOM_MAX = 85;
export const OPTIMAL_BOOM_FACTOR = 0.5;
export const TRIM_TOL_EASED = 0.28;
export const TRIM_TOL_TIGHT_UPWIND = 0.3;
export const TRIM_TOL_TIGHT_REACH = 0.12;
export const REACHINESS_START_TWA = 50;
export const REACHINESS_SPAN = 70;
export const TRIM_EFF_FLOOR = 0.15;
export const TRIM_GOOD = 0.9;
export const STREAK_GOOD = 0.85;

// Tack / gybe state machine
export const TACK_DRAG = 1.2; // kt/s
export const TACK_EXIT_SPEED_KEEP = 0.85;
export const TACK_SWING_MS = 450;
export const IRONS_SPEED = 0.6; // kt
export const STALL_RATE = 8; // deg/s
export const STALL_HOLD = 0.4; // s
export const BACK_SAIL_RATE = 12; // deg/s
export const SHEET_IN_THRESHOLD = 0.7;
export const GYBE_SWING_MS = 250;
export const GYBE_SPEED_KEEP = 0.95;
export const GYBE_LOCKOUT_MS = 250;
export const CRASH_SWING_MS = 90;
export const CRASH_SPEED_KEEP = 0.6;
export const CRASH_LOCKOUT_MS = 400;
export const CRASH_GYBE_MIN_SPEED = 4;

// Scoring
export const SCORE = {
  crashGybeFlat: -100,
  crossFinish: 200,
  gybe: 75,
  gybeFirstExtra: 50,
  ironsMaxPerEpisode: -150,
  ironsPerSec: -10,
  noGoPerSec: -3,
  offCourseFlat: -75,
  roundMark: 250,
  start: 100,
  tack: 75,
  tackFirstExtra: 50,
  targetTime: 120, // s — tuned for the v1 course size below
  timeBonusCap: 1500,
  timeBonusPerSecUnder: 20,
  trimBonusPerSec: 2,
} as const;

export const STREAK_TIERS: readonly {
  minSec: number;
  mult: number;
  label: string;
}[] = [
  { label: "", minSec: 0, mult: 1 },
  { label: "Trimmed!", minSec: 5, mult: 1.5 },
  { label: "In the groove!", minSec: 10, mult: 2 },
  { label: "Locked in!", minSec: 20, mult: 3 },
];

// Rendering scale. The boat is drawn intentionally a little oversized relative
// to the world (arcade convention) so it stays readable on a phone.
export const PX_PER_M = 7; // world pixels per metre
export const HULL_DISPLAY_H = 74; // px on screen (sprite native is taller)
export const BUOY_DISPLAY_H = 34;

// Course — windward/leeward, world frame (+Y up = upwind), metres.
// Slightly compressed from the spec's 300 m course so marks come into view.
export const COURSE = {
  leewardMark: { x: 0, y: -95 },
  markRadius: 9, // m
  startBoat: { x: 20, y: -15 },
  startLineY: -15,
  startPin: { x: -20, y: -15 },
  windDir: 0,
  windwardMark: { x: 0, y: 150 },
} as const;
