// The learn-to-sail campaign. Each level isolates ONE new skill and builds on
// the last — the "Mario 1-1" loop: teach in a safe space, let the player play
// with it, then test it, then combine. Difficulty is shaped two ways:
//   1. Course design (gentle angles, short legs, wind set so the first goal is
//      an easy reach rather than a beat).
//   2. Soft assists — per level we switch OFF hazards/penalties not yet taught
//      (capsize, crash gybes, irons penalty, even sail trim) and switch them on
//      as each lesson arrives. By the final level the full sim is live.
//
// Frame conventions (shared with constants.ts / sailing.ts):
//   heading 0 = north (+Y), clockwise. windDir = bearing the wind blows FROM.
//   So wind from the EAST (90) means sailing north (heading 0) is a beam reach.

import { COURSE, RESCUE_SPAWNS } from "./constants";

/** A point the boat must reach (within `r`), in order. */
export interface Objective {
  kind: "checkpoint" | "finish";
  x: number;
  y: number;
  r: number; // metres — how close counts as reached
  label: string;
}

/** Per-level safety rails. `true` = the hazard/mechanic is suppressed. */
export interface LevelAssists {
  autoTrim: boolean; // sail trims itself; the mainsheet lesson is hidden
  noCapsize: boolean; // the boat can heel but never goes over
  noCrashGybe: boolean; // downwind turns are always controlled
  noIronsPenalty: boolean; // no score hit for stalling head-to-wind / no-go
  noRescues: boolean; // no person-in-the-water side objectives
  showWedge: boolean; // draw the red no-go wedge on the water
}

export interface LevelDef {
  id: number; // 1-based, also the campaign order
  name: string;
  teaches: string; // one-line lesson label (menu + brief)
  brief: string[]; // bullet lines shown on the pre-level card
  introCoach: string; // first in-game coach line
  windDir: number;
  windSpeedKt: number;
  start: { x: number; y: number; heading: number; speedKt: number };
  objectives: Objective[];
  assists: LevelAssists;
  parSec: number; // finish under this for 3 stars
}

// Sensible defaults — a level lists only the rails it RELAXES from full sim.
const FULL_SIM: LevelAssists = {
  autoTrim: false,
  noCapsize: false,
  noCrashGybe: false,
  noIronsPenalty: false,
  noRescues: true,
  showWedge: true,
};

function assists(over: Partial<LevelAssists>): LevelAssists {
  return { ...FULL_SIM, ...over };
}

const cp = (x: number, y: number, label: string, r = 7): Objective => ({
  kind: "checkpoint",
  label,
  r,
  x,
  y,
});

export const LEVELS: LevelDef[] = [
  // 1 — STEERING. Wind from the east → sailing north is a fast, forgiving beam
  // reach. No trim, no capsize, no wedge. A gentle slalom teaches the one weird
  // truth: the tiller is backwards.
  {
    assists: assists({
      autoTrim: true,
      noCapsize: true,
      noCrashGybe: true,
      noIronsPenalty: true,
      showWedge: false,
    }),
    brief: [
      "The tiller is backwards: push it LEFT and the bow swings RIGHT.",
      "Steer the boat through each ring. Aim the tiller, not the bow.",
    ],
    id: 1,
    introCoach:
      "Welcome aboard! The sail looks after itself for now. Drag the tiller to weave through the rings — remember, push it AWAY from where you want to go.",
    name: "Cast Off",
    objectives: [
      cp(-10, 6, "Ring 1", 8),
      cp(10, 30, "Ring 2", 8),
      cp(-10, 54, "Ring 3", 8),
      { kind: "finish", label: "Finish", r: 9, x: 0, y: 78 },
    ],
    parSec: 40,
    start: { heading: 0, speedKt: 4, x: 0, y: -18 },
    teaches: "Steering — the backwards tiller",
    windDir: 90,
    windSpeedKt: 11,
  },

  // 2 — TRIM. Same easy reach, but now YOU work the mainsheet. The course bends
  // from a beam reach to a broad reach so the optimal trim changes and the
  // player learns to chase the green groove. Still no capsize, no wedge.
  {
    assists: assists({
      noCapsize: true,
      noCrashGybe: true,
      noIronsPenalty: true,
      showWedge: false,
    }),
    brief: [
      "Now you trim the sail with the mainsheet on the right.",
      "Keep the handle in the GREEN groove — too loose and it flaps, too tight and it stalls.",
    ],
    id: 2,
    introCoach:
      "Your turn on the mainsheet. Slide it so the handle sits in the green groove — that's the sail trimmed just right for your angle to the wind.",
    name: "Find the Groove",
    objectives: [
      cp(8, 8, "Gate 1", 8),
      cp(14, 34, "Gate 2", 8),
      cp(6, 60, "Gate 3", 8),
      { kind: "finish", label: "Finish", r: 9, x: -6, y: 86 },
    ],
    parSec: 50,
    start: { heading: 10, speedKt: 4, x: 0, y: -20 },
    teaches: "Trim — keep the sail in the groove",
    windDir: 90,
    windSpeedKt: 11,
  },

  // 3 — THE NO-GO ZONE. Wind swings to the north and the red wedge appears. The
  // gates step up across the wind on a close reach (~50° off the wind): sail the
  // edge of the wedge and you lay each one, but point a touch too high and the
  // sail dies — bear away to fill it. Set to the west so it stays in open water,
  // and no northing target big enough to need a tack (that's the next level).
  {
    assists: assists({
      noCapsize: true,
      noCrashGybe: true,
      noIronsPenalty: true,
    }),
    brief: [
      "The wind now blows from the NORTH — see the red no-go wedge.",
      "Sail too close to the wind and the sail flaps and stalls. Bear away to fill it.",
    ],
    id: 3,
    introCoach:
      "That red wedge points straight at the wind — you can't sail into it. Stay on the EDGE of the wedge, not inside it. If the sail flaps and she slows, bear away (turn downwind) to fill it again.",
    name: "The No-Go Zone",
    objectives: [
      cp(-5, 4, "Gate 1", 8),
      cp(-22, 18, "Gate 2", 8),
      cp(-39, 32, "Gate 3", 8),
      { kind: "finish", label: "Finish", r: 9, x: -56, y: 46 },
    ],
    parSec: 55,
    start: { heading: 310, speedKt: 4, x: 12, y: -10 },
    teaches: "Points of sail & the no-go zone",
    windDir: 0,
    windSpeedKt: 11,
  },

  // 4 — TACKING. Windward mark dead upwind: the only way there is to zig-zag,
  // turning the bow through the wind. Still no capsize and no downwind hazards —
  // this level is all about the tack.
  {
    assists: assists({
      noCapsize: true,
      noCrashGybe: true,
    }),
    brief: [
      "The mark is straight upwind — you can't sail there directly.",
      "TACK to zig-zag: steer the bow through the wind onto the other side, then trim in.",
    ],
    id: 4,
    introCoach:
      "The mark's dead upwind. Sail as close as you can on one side, then tack — swing the bow through the wind — and sail close-hauled the other way. Zig-zag up to it.",
    name: "Zig-Zag Upwind",
    objectives: [
      cp(0, 80, "Windward mark", 9),
      { kind: "finish", label: "Finish", r: 9, x: 0, y: -10 },
    ],
    parSec: 90,
    start: { heading: 45, speedKt: 4, x: 0, y: -20 },
    teaches: "Tacking — beating to windward",
    windDir: 0,
    windSpeedKt: 11,
  },

  // 5 — GYBING. Start high, run downwind to a leeward mark. Going downwind you
  // GYBE (stern through the wind) — and if you turn without sheeting in first
  // the boom slams across (a crash gybe). Crash gybes are ON now (the lesson),
  // but capsize is still off so a mistake costs speed, not the whole boat.
  {
    assists: assists({
      noCapsize: true,
    }),
    brief: [
      "Now you're heading DOWNWIND to the leeward mark.",
      "To turn downwind you GYBE. Sheet IN before the stern crosses the wind, or the boom slams across.",
    ],
    id: 5,
    introCoach:
      "Running downwind now. To change sides you gybe — but pull the mainsheet IN before you turn the stern through the wind, then ease it out after. Turn smoothly!",
    name: "Downwind Run",
    // Two offset marks force the boat to cross dead-downwind twice (a gybe each
    // time), and the finish stays downwind so the lesson never turns into an
    // untaught upwind beat.
    objectives: [
      cp(-28, 44, "Gate", 9),
      cp(20, -6, "Leeward mark", 9),
      { kind: "finish", label: "Finish", r: 9, x: 0, y: -56 },
    ],
    parSec: 80,
    start: { heading: 150, speedKt: 4, x: 0, y: 90 },
    teaches: "Gybing — turning downwind safely",
    windDir: 0,
    windSpeedKt: 11,
  },

  // 6 — CREW & BALANCE. Full physics arrives: the boat can capsize. A short beat
  // and a run with the crew weight live — cross to the windward rail through each
  // turn, hike to stay flat, and time the cross for a rewarded roll tack/gybe.
  {
    assists: assists({}),
    brief: [
      "Real balance now — lean the wrong way and she capsizes.",
      "Cross to the new windward rail through every tack and gybe. Hike out to stay flat.",
    ],
    id: 6,
    introCoach:
      "Crew weight matters now. After each tack or gybe, cross to the new high (windward) side and hike out to keep her flat. Time the cross with the turn for a roll — it flicks you forward.",
    name: "Crew & Balance",
    // A real beat (tack) up to the windward mark, then an offset run that forces
    // two gybes back down — so the crew-cross lesson is exercised on every kind
    // of turn, with capsize live.
    objectives: [
      cp(0, 64, "Windward mark", 9),
      cp(-26, 10, "Gate", 9),
      cp(20, -40, "Gate", 9),
      { kind: "finish", label: "Finish", r: 9, x: 0, y: -64 },
    ],
    parSec: 110,
    start: { heading: 45, speedKt: 4, x: 0, y: -20 },
    teaches: "Crew weight, hiking & roll tacks",
    windDir: 0,
    windSpeedKt: 12,
  },

  // 7 — THE FULL COURSE. Everything together: the real windward/leeward race
  // around the harbour, with swimmers to rescue in open water. No assists.
  {
    assists: assists({ noRescues: false }),
    brief: [
      "Put it all together: beat up to the windward mark, run down to the leeward, finish.",
      "Sail past the swimmers in the water to pick them up for bonus points.",
    ],
    id: 7,
    introCoach:
      "This is the real thing. Round the windward mark, bear away down to the leeward mark, then head back up to finish. Grab any swimmers on the way. Good sailing!",
    name: "The Full Course",
    // Beat up to the windward mark, bear away through an offset wing gate (which
    // forces a real gybe on the way down), round the leeward mark, then beat to
    // the finish. Legs kept near the ~120 m scale the time bonus was tuned for.
    objectives: [
      cp(0, 120, "Windward mark", 9),
      cp(-28, 30, "Wing gate", 9),
      cp(22, -70, "Leeward mark", 9),
      {
        kind: "finish",
        label: "Finish",
        r: 10,
        x: 0,
        y: COURSE.startLineY,
      },
    ],
    parSec: 120,
    start: { heading: 45, speedKt: 2, x: 0, y: COURSE.startLineY - 6 },
    teaches: "The full race — everything combined",
    windDir: 0,
    windSpeedKt: 12,
  },
];

export const RESCUE_POINTS_FOR = (level: LevelDef) =>
  level.assists.noRescues ? [] : RESCUE_SPAWNS;

export function levelById(id: number): LevelDef {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}

export const FIRST_LEVEL_ID = LEVELS[0].id;
export const LAST_LEVEL_ID = LEVELS.at(-1)?.id ?? LEVELS[0].id;
