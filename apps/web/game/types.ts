export type GameMode = "practice" | "race";

export type SailState =
  | "SAILING"
  | "TACKING"
  | "IN_IRONS"
  | "GYBING"
  | "CRASH_GYBE";

export type Tack = "PORT" | "STARBOARD" | "HEAD_TO_WIND";

/** Live input the React controls write and the engine reads each frame. */
export interface GameInput {
  tiller: number; // -1 port .. +1 starboard (inverted: bow turns opposite)
  sheet: number; // 0 eased/out .. 1 sheeted/in
  backSail: boolean; // beginner assist while in irons
  paused: boolean;
  hike: boolean; // crew leans out over the windward rail for speed + stability
}

export type CrewSide = -1 | 1; // -1 = port rail, +1 = starboard rail

/** A circular collision obstacle in world metres (beach/breakwater/dock/baths). */
export interface Obstacle {
  x: number;
  y: number;
  r: number;
}

/** Everything the 3D boat model needs each frame (scene → BoatModel.update). */
export interface BoatView {
  heading: number;
  tack: Tack;
  sheet: number;
  sailState: SailState;
  crewSide: CrewSide; // which rail the crew sits on (windward)
  hiking: boolean; // crew leaning out
  heel: number; // lean angle in radians (+ = heeled to leeward)
  capsized: boolean;
  nowMs: number;
  dtSec: number;
}

/** Snapshot the Phaser scene publishes to the React HUD (throttled). */
export interface HudState {
  mode: GameMode;
  running: boolean;
  windDir: number;
  windSpeedKt: number;
  headingDeg: number;
  speedKt: number;
  signedTwa: number;
  absTwa: number;
  pointOfSail: string;
  tack: Tack;
  sailState: SailState;
  inNoGo: boolean;
  trimEff: number;
  optSheet: number;
  sheet: number;
  score: number;
  streakMult: number;
  streakLabel: string;
  elapsed: number;
  coach: string | null;
  // next mark guidance
  nextMarkLabel: string | null;
  nextMarkBearingDeg: number | null; // bearing from boat, screen-space deg (0=up, cw)
  nextMarkDistM: number | null;
  // crew + rescue
  crewSide: number; // -1 port / +1 starboard rail
  hiking: boolean;
  capsized: boolean;
  needCross: boolean; // true mid tack/gybe: prompt the player to cross sides
  mobBearingDeg: number | null; // person-overboard guidance (null = none active)
  mobDistM: number | null;
  result: RaceResult | null;
}

export interface RaceResult {
  finished: boolean;
  total: number;
  stars: number;
  elapsed: number;
  timeBonus: number;
  marksRounded: number;
  cleanTacks: number;
  cleanGybes: number;
  crashGybes: number;
  avgTrimEff: number;
  maxStreak: number;
  lines: string[];
}
