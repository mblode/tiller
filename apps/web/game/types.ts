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

/** A short-lived floating "+90 / -100" chip the HUD animates over each event. */
export interface ScorePopup {
  id: number;
  text: string;
  points: number;
}

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
  luff: number; // sail flap [0,1]: 0 = drawing full, 1 = stalled/flapping
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
  running: boolean;
  // current level
  levelId: number;
  levelName: string;
  objectiveIndex: number; // how many objectives are done (0..total)
  objectiveTotal: number;
  showWedge: boolean; // whether the no-go wedge is taught/drawn this level
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
  // drowned-passenger rescue objectives scattered in open water
  rescuedCount: number;
  rescueTotal: number;
  rescueBearingDeg: number | null; // nearest un-rescued swimmer (null = none left)
  rescueDistM: number | null;
  // transient floating score chips, freshest last
  popups: ScorePopup[];
  result: RaceResult | null;
}

export interface RaceResult {
  finished: boolean;
  levelId: number;
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
