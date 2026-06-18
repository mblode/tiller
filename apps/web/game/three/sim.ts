// Framework-agnostic sailing simulation. Lifted verbatim from the original
// Phaser scene's update logic — no rendering, no Phaser. The Three.js scene
// drives it with (dt, nowMs) and reads `boat`/`derived` to place meshes.

import type { GameBridge } from "../bridge";
import {
  ACCEL_TAU,
  BACK_SAIL_RATE,
  CRASH_GYBE_MIN_SPEED,
  DECEL_TAU,
  DEG2RAD,
  GYBE_ZONE,
  HEAD_TO_WIND_DEADBAND,
  HULL_MAX_KT,
  IRONS_SPEED,
  IRONS_STERNWAY_MAX,
  KT_TO_MS,
  MANEUVER,
  MAX_TURN_RATE,
  NO_GO_HALF,
  RESCUE,
  RESCUE_SPAWNS,
  REVERSE_AUTHORITY_REF,
  ROLL_BOOST,
  ROLL_WINDOW_MS,
  SCORE,
  SHEET_IN_THRESHOLD,
  STALL_HOLD,
  STALL_RATE,
  STERNWAY_TRIGGER_SPEED,
  STREAK_GOOD,
  STREAK_TIERS,
  TACK_DRAG,
  TACK_EXIT_SPEED_KEEP,
  TRIM_GOOD,
} from "../constants";
import { FIRST_LEVEL_ID, levelById } from "../levels";
import type { LevelDef, Objective } from "../levels";
import {
  clamp,
  luffFactor,
  optimalSheet,
  pointOfSailName,
  signedTWA,
  steerAuthority,
  targetSpeedKt,
  trimEfficiency,
  wrap360,
} from "../sailing";
import type {
  CrewSide,
  HudState,
  Obstacle,
  RaceResult,
  SailState,
  ScorePopup,
  Tack,
} from "../types";

/** How a tack/gybe was executed, for graded scoring + feedback. */
type ManeuverGrade = "clean" | "ok" | "sloppy";
const POPUP_TTL_MS = 1500;

const RAD2DEG = 180 / Math.PI;
const PUBLISH_MS = 90;
// crew / heel / capsize / rescue (kept deliberately simple)
const CAPSIZE_HEEL = 0.72; // rad — beyond this the dinghy goes over
const MOB_RADIUS = 7; // m — sail this close to recover crew in the water
const HIKE_SPEED_MULT = 1.07; // hiking flattens the boat → a touch more drive
const CAPSIZE_PENALTY = -80;
const RESCUE_POINTS = 120;
const CAPSIZE_RECOVER_MS = 2600;

export interface Derived {
  sTwa: number;
  aTwa: number;
  sheet: number;
  tack: Tack;
  trimEff: number;
  optSheet: number;
  pointOfSail: string;
  luff: number; // sail flap [0,1]: 0 = drawing full, 1 = stalled/flapping
}

export interface Boat {
  x: number;
  y: number;
  heading: number;
  speedKt: number;
  omega: number;
  state: SailState;
  tillerLockedUntil: number;
  bufferedTiller: number;
  entrySign: number;
  entrySpeed: number; // boat speed (kt) captured when a tack/gybe began
  stallTimer: number;
  capsizeUntil: number;
}

function gradeLabel(grade: ManeuverGrade): string {
  if (grade === "clean") {
    return "Clean";
  }
  if (grade === "ok") {
    return "OK";
  }
  return "Sloppy";
}

function tackFor(sTwa: number, aTwa: number): Tack {
  if (aTwa <= HEAD_TO_WIND_DEADBAND) {
    return "HEAD_TO_WIND";
  }
  return sTwa > 0 ? "STARBOARD" : "PORT";
}

export class Sim {
  level: LevelDef = levelById(FIRST_LEVEL_ID);
  windDir = this.level.windDir;
  windSpeed = this.level.windSpeedKt;
  running = false;
  result: RaceResult | null = null;
  /** Set on a crash gybe / capsize; renderer shakes the camera while now < shakeUntil. */
  shakeUntil = 0;

  // crew + heel (read by the renderer for the 3D boat)
  crewSide: CrewSide = 1; // which rail the crew is actually sitting on
  heel = 0; // signed lean, + = heeled to leeward
  /** Person-overboard to rescue (world metres), or null. */
  mob: { x: number; y: number } | null = null;
  /** Drowned-passenger rescue objectives scattered in open water. */
  rescues: { x: number; y: number; picked: boolean }[] = [];

  boat: Boat = {
    bufferedTiller: 0,
    capsizeUntil: 0,
    entrySign: 1,
    entrySpeed: 0,
    heading: 90,
    omega: 0,
    speedKt: 0,
    stallTimer: 0,
    state: "SAILING",
    tillerLockedUntil: 0,
    x: 0,
    y: 0,
  };

  derived: Derived = {
    aTwa: 0,
    luff: 1,
    optSheet: 0.5,
    pointOfSail: "In irons",
    sTwa: 0,
    sheet: 0.5,
    tack: "HEAD_TO_WIND",
    trimEff: 0,
  };

  objectives: Objective[] = [];
  targetIdx = 0;

  private bridge: GameBridge;
  private now = 0;
  private elapsed = 0;
  private score = 0;
  private tackCount = 0;
  private gybeCount = 0;
  private crashGybes = 0;
  private ironsPenaltyThisEpisode = 0;
  private trimSum = 0;
  private trimSamples = 0;
  private maxStreak = 0;
  private streakSec = 0;
  private didFirstTack = false;
  private didFirstGybe = false;
  private capsizeCount = 0;
  private coach: string | null = null;
  private coachUntil = 0;
  private coachKey = "";
  private wrongHelmTimer = 0;
  private prevSign = 1;
  private lastPublish = 0;
  private lastRestart = 0;
  private lastCross = 0;
  private popups: { id: number; text: string; points: number; born: number }[] =
    [];
  private popupSeq = 0;
  private lastCrossAt = -1e9; // nowMs of the last crew cross-over
  private obstacles: Obstacle[] = [];

  setObstacles(obstacles: Obstacle[]) {
    this.obstacles = obstacles;
  }

  get capsized(): boolean {
    return this.boat.capsizeUntil > this.now;
  }

  /** Windward rail = the side the wind blows over (where the crew should sit). */
  private windSide(): CrewSide {
    return this.derived.sTwa >= 0 ? 1 : -1;
  }

  constructor(bridge: GameBridge) {
    this.bridge = bridge;
    this.level = levelById(bridge.command.levelId);
    this.start();
    this.lastRestart = bridge.command.restart;
    this.lastCross = bridge.command.crossSide;
  }

  /** Load a level definition; takes effect on the next start(). */
  setLevel(id: number) {
    this.level = levelById(id);
  }

  start() {
    const lvl = this.level;
    this.windDir = lvl.windDir;
    this.windSpeed = lvl.windSpeedKt;
    this.boat = {
      bufferedTiller: 0,
      capsizeUntil: 0,
      entrySign: 1,
      entrySpeed: 0,
      heading: lvl.start.heading,
      omega: 0,
      speedKt: lvl.start.speedKt,
      stallTimer: 0,
      state: "SAILING",
      tillerLockedUntil: 0,
      x: lvl.start.x,
      y: lvl.start.y,
    };
    this.score = 0;
    this.elapsed = 0;
    this.result = null;
    this.tackCount = 0;
    this.gybeCount = 0;
    this.crashGybes = 0;
    this.capsizeCount = 0;
    this.ironsPenaltyThisEpisode = 0;
    this.trimSum = 0;
    this.trimSamples = 0;
    this.maxStreak = 0;
    this.streakSec = 0;
    this.didFirstTack = false;
    this.didFirstGybe = false;
    // Open each level with its own orientation line so the player knows the one
    // new thing this level is teaching before they touch the controls.
    this.coach = lvl.introCoach;
    this.coachUntil = this.now + 6500;
    this.coachKey = "intro";
    this.shakeUntil = 0;
    this.heel = 0;
    this.lastCrossAt = -1e9;
    this.mob = null;
    this.popups = [];
    this.rescues = lvl.assists.noRescues
      ? []
      : RESCUE_SPAWNS.map((s) => ({ picked: false, x: s.x, y: s.y }));
    // start the crew on the correct (windward) rail for the opening heading
    this.crewSide = signedTWA(this.boat.heading, this.windDir) >= 0 ? 1 : -1;
    this.objectives = lvl.objectives;
    this.targetIdx = 0;
    this.running = true;
  }

  update(dt: number, nowMs: number) {
    this.now = nowMs;
    this.drainCommands();

    const { input } = this.bridge;
    if (!this.running || input.paused || this.result) {
      this.maybePublish(nowMs, true);
      return;
    }

    this.elapsed += dt;
    this.stepPhysics(dt, nowMs);
    this.stepCrew(dt);
    this.stepRescue();
    this.stepPassengers();
    this.stepCourse();
    this.stepScoring(dt);
    this.stepCoach(nowMs);
    this.maybePublish(nowMs, false);
  }

  private resolveObstacles() {
    const b = this.boat;
    const pad = 2; // boat half-length
    for (const o of this.obstacles) {
      const dx = b.x - o.x;
      const dy = b.y - o.y;
      const rr = o.r + pad;
      if (dx * dx + dy * dy < rr * rr) {
        const d = Math.hypot(dx, dy) || 0.0001;
        b.x = o.x + (dx / d) * rr;
        b.y = o.y + (dy / d) * rr;
        if (b.speedKt > 0.5) {
          this.setCoach(
            "aground",
            "Ran aground! Steer back to open water.",
            2200
          );
        }
        b.speedKt = Math.min(b.speedKt, 0);
      }
    }
  }

  private stepCrew(dt: number) {
    const b = this.boat;
    // drain cross-over presses: the player moves the crew to the other rail
    const c = this.bridge.command.crossSide;
    if (c !== this.lastCross) {
      this.lastCross = c;
      this.crewSide = this.crewSide === 1 ? -1 : 1;
      this.lastCrossAt = this.now;
    }
    const sailing = b.state === "SAILING" && !this.capsized;
    const wind = this.windSide();
    const wrongSide =
      sailing && this.derived.aTwa > 8 && this.crewSide !== wind;

    // heel: power leans the boat to leeward; hiking flattens it; crew caught on
    // the leeward side after a tack/gybe rolls it right over.
    const power = Math.min(1, Math.max(0, b.speedKt / HULL_MAX_KT));
    let targetHeel = power * 0.4 * -wind; // + heel = toward +X
    if (this.bridge.input.hike) {
      targetHeel *= 0.35;
    }
    if (wrongSide) {
      targetHeel += -wind * 0.7;
    }
    if (this.capsized) {
      targetHeel = -wind * 1.4;
    }
    this.heel += (targetHeel - this.heel) * Math.min(1, 4 * dt);

    if (
      !this.capsized &&
      !this.level.assists.noCapsize &&
      Math.abs(this.heel) > CAPSIZE_HEEL
    ) {
      this.capsize();
    }
  }

  private capsize() {
    const b = this.boat;
    this.capsizeCount += 1;
    b.capsizeUntil = this.now + CAPSIZE_RECOVER_MS;
    b.speedKt = 0;
    this.shakeUntil = this.now + 220;
    this.mob = { x: b.x, y: b.y }; // crew overboard at the capsize spot
    this.score = Math.max(0, this.score + CAPSIZE_PENALTY);
    this.addPopup("Capsized", CAPSIZE_PENALTY);
    this.setCoach(
      "capsize",
      "Capsized! Right the boat, then sail back for your crew in the water.",
      3400
    );
  }

  private stepRescue() {
    if (!this.mob) {
      return;
    }
    const b = this.boat;
    const d = Math.hypot(this.mob.x - b.x, this.mob.y - b.y);
    if (!this.capsized && d < MOB_RADIUS) {
      this.mob = null;
      this.score += RESCUE_POINTS;
      this.addPopup("Crew aboard", RESCUE_POINTS);
      this.setCoach("rescued", "Crew aboard — great rescue! Back to it.", 2600);
    }
  }

  /** Collect drowned-passenger objectives by sailing within range. */
  private stepPassengers() {
    if (this.capsized) {
      return;
    }
    const b = this.boat;
    for (const p of this.rescues) {
      if (p.picked) {
        continue;
      }
      if (Math.hypot(p.x - b.x, p.y - b.y) < RESCUE.radius) {
        p.picked = true;
        this.score += RESCUE.points;
        this.addPopup("Rescue!", RESCUE.points);
        this.setCoach(
          "passenger",
          "Sailor aboard — nice pickup! Get them safely round.",
          2600
        );
      }
    }
  }

  /** Queue a transient floating "+90 / -100" chip for the HUD. */
  private addPopup(text: string, points: number) {
    this.popupSeq += 1;
    this.popups.push({ born: this.now, id: this.popupSeq, points, text });
  }

  private drainCommands() {
    const c = this.bridge.command;
    if (c.restart !== this.lastRestart) {
      this.lastRestart = c.restart;
      this.setLevel(c.levelId);
      this.start();
    }
  }

  private stepPhysics(dt: number, time: number) {
    const b = this.boat;
    const { input } = this.bridge;
    const tillerLocked = time < b.tillerLockedUntil;
    let tiller = clamp(input.tiller, -1, 1);
    if (tillerLocked) {
      b.bufferedTiller = tiller;
      tiller = 0;
    } else {
      b.bufferedTiller = 0;
    }

    if (b.capsizeUntil > time) {
      b.speedKt *= 0.9;
    } else if (b.speedKt < 0) {
      const revAuth = Math.min(1, Math.abs(b.speedKt) / REVERSE_AUTHORITY_REF);
      b.omega = tiller * MAX_TURN_RATE * revAuth;
      b.heading = wrap360(b.heading + b.omega * dt);
    } else {
      b.omega = -tiller * MAX_TURN_RATE * steerAuthority(b.speedKt);
      b.heading = wrap360(b.heading + b.omega * dt);
    }

    if (input.backSail && b.state === "IN_IRONS") {
      const side = b.entrySign >= 0 ? 1 : -1;
      b.heading = wrap360(b.heading + side * BACK_SAIL_RATE * dt);
    }

    const sTwa = signedTWA(b.heading, this.windDir);
    const aTwa = Math.abs(sTwa);
    // autoTrim levels work the sail for the player: it sits at optimal so the
    // only thing to learn this level is steering.
    const sheet = this.level.assists.autoTrim
      ? optimalSheet(aTwa)
      : clamp(input.sheet, 0, 1);

    let target = targetSpeedKt(aTwa, sheet, this.windSpeed);
    if (aTwa < NO_GO_HALF && b.speedKt < STERNWAY_TRIGGER_SPEED) {
      const intoWind = 1 - aTwa / NO_GO_HALF;
      target = IRONS_STERNWAY_MAX * intoWind;
    }
    if (b.state === "TACKING") {
      target -= TACK_DRAG * dt * 6;
    }
    // hiking out flattens the boat and lets it carry power → a touch more drive
    if (input.hike && b.state === "SAILING" && target > 0) {
      target *= HIKE_SPEED_MULT;
    }
    const tau = target > b.speedKt ? ACCEL_TAU : DECEL_TAU;
    b.speedKt += (target - b.speedKt) * (1 - Math.exp(-dt / tau));

    const r = b.heading * DEG2RAD;
    const sp = b.speedKt * KT_TO_MS;
    b.x += Math.sin(r) * sp * dt;
    b.y += Math.cos(r) * sp * dt;
    this.resolveObstacles();

    this.stepStateMachine(b, sTwa, aTwa, sheet, dt, time);

    // Sail flap cue: graded everywhere, forced full when truly stalled/in irons.
    let luff = luffFactor(aTwa, sheet);
    if (b.state === "IN_IRONS" || aTwa <= HEAD_TO_WIND_DEADBAND) {
      luff = 1;
    }

    this.derived = {
      aTwa,
      luff,
      optSheet: optimalSheet(aTwa),
      pointOfSail: pointOfSailName(aTwa),
      sTwa,
      sheet,
      tack: tackFor(sTwa, aTwa),
      trimEff: trimEfficiency(sheet, aTwa),
    };

    const trying = aTwa < NO_GO_HALF + 12 && Math.abs(tiller) > 0.3;
    const towardWind = Math.sign(b.omega) !== Math.sign(sTwa);
    this.wrongHelmTimer = trying && towardWind ? this.wrongHelmTimer + dt : 0;
  }

  private stepStateMachine(
    b: Boat,
    sTwa: number,
    aTwa: number,
    sheet: number,
    dt: number,
    time: number
  ) {
    const sign = sTwa >= 0 ? 1 : -1;
    const crossedStern = sign !== this.prevSign && aTwa > 90;

    if (b.state === "SAILING") {
      if (aTwa < NO_GO_HALF) {
        b.state = "TACKING";
        b.entrySign = this.prevSign;
        b.entrySpeed = b.speedKt;
        b.stallTimer = 0;
      } else if (aTwa > GYBE_ZONE) {
        b.state = "GYBING";
        b.entrySign = this.prevSign;
        b.entrySpeed = b.speedKt;
      }
    } else if (b.state === "TACKING") {
      if (b.speedKt < IRONS_SPEED && Math.abs(b.omega) < STALL_RATE) {
        b.stallTimer += dt;
        if (b.stallTimer > STALL_HOLD) {
          b.state = "IN_IRONS";
        }
      } else {
        b.stallTimer = 0;
      }
      if (sign !== b.entrySign && aTwa > NO_GO_HALF) {
        b.state = "SAILING";
        b.speedKt *= TACK_EXIT_SPEED_KEEP;
        // sign is the new windward side: a crew already there from a recent
        // cross means a clean roll tack → drive the boat out of the turn.
        const windward: CrewSide = sign >= 0 ? 1 : -1;
        const rolled = this.rolledWell(windward);
        if (rolled) {
          b.speedKt *= ROLL_BOOST;
        }
        this.onTackComplete(rolled, windward);
      }
    } else if (b.state === "IN_IRONS") {
      if (aTwa > NO_GO_HALF && b.speedKt > IRONS_SPEED) {
        b.state = "SAILING";
      }
    } else if (b.state === "GYBING") {
      this.stepGybing(b, sheet, aTwa, crossedStern, time);
    } else if (b.state === "CRASH_GYBE" && time > b.tillerLockedUntil) {
      b.state = "SAILING";
    }

    this.prevSign = sign;
  }

  private stepGybing(
    b: Boat,
    sheet: number,
    aTwa: number,
    crossedStern: boolean,
    time: number
  ) {
    if (crossedStern) {
      const controlled =
        this.level.assists.noCrashGybe ||
        sheet >= SHEET_IN_THRESHOLD ||
        b.speedKt < CRASH_GYBE_MIN_SPEED;
      if (controlled) {
        b.state = "SAILING";
        b.speedKt *= 0.95;
        b.tillerLockedUntil = time + 250;
        const ws: CrewSide = signedTWA(b.heading, this.windDir) >= 0 ? 1 : -1;
        const rolled = this.rolledWell(ws);
        if (rolled) {
          b.speedKt *= ROLL_BOOST;
        }
        this.onGybe(false, rolled, ws);
      } else {
        b.state = "CRASH_GYBE";
        b.speedKt *= 0.6;
        b.tillerLockedUntil = time + 400;
        if (!this.level.assists.noCapsize) {
          b.capsizeUntil = time + 600;
        }
        this.shakeUntil = time + 180;
        this.onGybe(true);
      }
    } else if (aTwa < GYBE_ZONE - 6) {
      b.state = "SAILING";
    }
  }

  /** True when the crew has just crossed to the new windward rail — a clean roll. */
  private rolledWell(windwardSide: CrewSide): boolean {
    return (
      this.crewSide === windwardSide &&
      this.now - this.lastCrossAt < ROLL_WINDOW_MS
    );
  }

  /**
   * Grade a completed turn: a clean roll always grades "clean", otherwise grade
   * on how much boat speed survived. Crew left on the wrong rail costs a little.
   */
  private gradeManeuver(
    rolled: boolean,
    windward: CrewSide,
    tier: { clean: number; ok: number; sloppy: number }
  ): { grade: ManeuverGrade; points: number; wrongRail: boolean } {
    const b = this.boat;
    const ratio = b.entrySpeed > 0.3 ? b.speedKt / b.entrySpeed : 1;
    let grade: ManeuverGrade = "sloppy";
    if (rolled || ratio >= MANEUVER.cleanSpeedKeep) {
      grade = "clean";
    } else if (ratio >= MANEUVER.okSpeedKeep) {
      grade = "ok";
    }
    const wrongRail = this.crewSide !== windward;
    let points = tier[grade];
    if (wrongRail) {
      points += MANEUVER.wrongRailPenalty;
    }
    return { grade, points, wrongRail };
  }

  private onTackComplete(rolled: boolean, windward: CrewSide) {
    this.tackCount += 1;
    const { grade, points, wrongRail } = this.gradeManeuver(
      rolled,
      windward,
      MANEUVER.tack
    );
    let total = points;
    if (!this.didFirstTack && grade === "clean") {
      total += SCORE.tackFirstExtra;
    }
    this.didFirstTack = true;
    this.score = Math.max(0, this.score + total);
    this.addPopup(rolled ? "Roll tack!" : `${gradeLabel(grade)} tack`, total);
    let line: string;
    if (rolled) {
      line =
        "Beautiful roll tack — crossing as she came round drove her out of the turn!";
    } else if (wrongRail) {
      line = "Tacked, but cross to the new windward rail to keep her flat.";
    } else if (grade === "clean") {
      line = "Nice tack! Settle on the new heading and trim in.";
    } else {
      line = "Tacked, but you lost a lot of speed — turn smoothly next time.";
    }
    this.setCoach("tack-done", line, 2200);
  }

  private onGybe(crash: boolean, rolled = false, windward: CrewSide = 1) {
    if (crash) {
      this.crashGybes += 1;
      this.score = Math.max(0, this.score + SCORE.crashGybeFlat);
      this.addPopup("Crash gybe", SCORE.crashGybeFlat);
      this.setCoach(
        "crash",
        "Crash gybe! Next time sheet IN before turning the stern through.",
        3200
      );
      return;
    }
    this.gybeCount += 1;
    const { grade, points, wrongRail } = this.gradeManeuver(
      rolled,
      windward,
      MANEUVER.gybe
    );
    let total = points;
    if (!this.didFirstGybe && grade === "clean") {
      total += SCORE.gybeFirstExtra;
    }
    this.didFirstGybe = true;
    this.score = Math.max(0, this.score + total);
    this.addPopup(rolled ? "Roll gybe!" : `${gradeLabel(grade)} gybe`, total);
    let line: string;
    if (rolled) {
      line =
        "Lovely roll gybe — that cross flicked her forward out of the turn!";
    } else if (wrongRail) {
      line = "Gybed, but get your weight to the new windward side.";
    } else if (grade === "clean") {
      line = "Smooth gybe — now ease the sheet back out.";
    } else {
      line = "Gybed, but she stalled out of the turn — keep her moving.";
    }
    this.setCoach("gybe-done", line, 2200);
  }

  private stepCourse() {
    if (this.targetIdx >= this.objectives.length) {
      return;
    }
    const b = this.boat;
    const obj = this.objectives[this.targetIdx];
    if (Math.hypot(obj.x - b.x, obj.y - b.y) >= obj.r) {
      return;
    }
    this.targetIdx += 1;
    if (obj.kind === "finish") {
      this.finishRace();
      return;
    }
    this.score += SCORE.roundMark;
    this.addPopup(obj.label, SCORE.roundMark);
    const next = this.objectives[this.targetIdx];
    this.setCoach(
      "rounded",
      next ? `${obj.label} — next: ${next.label}.` : `${obj.label} done!`,
      2400
    );
  }

  private stepScoring(dt: number) {
    const d = this.derived;
    this.trimSum += d.trimEff;
    this.trimSamples += 1;

    const goodTick = d.aTwa >= NO_GO_HALF && d.trimEff >= STREAK_GOOD;
    if (goodTick) {
      this.streakSec += dt;
      this.maxStreak = Math.max(this.maxStreak, this.streakSec);
    } else if (d.aTwa < NO_GO_HALF) {
      this.streakSec = 0;
    }

    const mult = this.streakMult();
    if (d.trimEff >= TRIM_GOOD && d.aTwa >= NO_GO_HALF) {
      this.score += SCORE.trimBonusPerSec * mult * dt;
    }
    if (!this.level.assists.noIronsPenalty) {
      if (this.boat.state === "IN_IRONS") {
        if (this.ironsPenaltyThisEpisode > SCORE.ironsMaxPerEpisode) {
          const pen = SCORE.ironsPerSec * dt;
          this.score += pen;
          this.ironsPenaltyThisEpisode += pen;
        }
      } else {
        this.ironsPenaltyThisEpisode = 0;
      }
      if (
        d.aTwa < NO_GO_HALF &&
        this.boat.speedKt > 0.2 &&
        this.boat.state !== "IN_IRONS"
      ) {
        this.score += SCORE.noGoPerSec * dt;
      }
    }
    if (this.score < 0) {
      this.score = 0;
    }
  }

  private streakMult(): number {
    let mult = 1;
    for (const t of STREAK_TIERS) {
      if (this.streakSec >= t.minSec) {
        ({ mult } = t);
      }
    }
    return mult;
  }

  private streakLabel(): string {
    let label = "";
    for (const t of STREAK_TIERS) {
      if (this.streakSec >= t.minSec) {
        ({ label } = t);
      }
    }
    return label;
  }

  private finishRace() {
    const underPar = Math.max(0, this.level.parSec - this.elapsed);
    const timeBonus = Math.min(
      SCORE.timeBonusCap,
      Math.round(underPar * SCORE.timeBonusPerSecUnder)
    );
    this.score += timeBonus;
    const avgTrim = this.trimSamples ? this.trimSum / this.trimSamples : 0;
    const clean = this.crashGybes === 0 && this.capsizeCount === 0;
    const fast = this.elapsed <= this.level.parSec;

    // Generous, encouraging grading: finishing always earns a star; a clean run
    // earns a second; a clean AND brisk run earns all three.
    let stars = 1;
    if (clean) {
      stars = 2;
    }
    if (clean && fast) {
      stars = 3;
    }

    const lines: string[] = [`${this.level.name} complete!`];
    if (stars === 3) {
      lines.push("Three stars — clean and quick. You've got this.");
    } else if (clean) {
      lines.push(
        "Clean run! Trim a little sharper and beat the par time for 3 stars."
      );
    }
    if (this.capsizeCount > 0) {
      lines.push("Keep your weight on the windward rail to stay upright.");
    } else if (this.crashGybes > 0) {
      lines.push("Sheet in before you turn the stern through the wind.");
    }
    if (!this.level.assists.autoTrim && avgTrim < 0.8) {
      lines.push("Keep the mainsheet in the green groove for more speed.");
    }

    this.result = {
      avgTrimEff: avgTrim,
      cleanGybes: this.gybeCount,
      cleanTacks: this.tackCount,
      crashGybes: this.crashGybes,
      elapsed: this.elapsed,
      finished: true,
      levelId: this.level.id,
      lines,
      marksRounded: this.objectives.filter((o) => o.kind === "checkpoint")
        .length,
      maxStreak: this.maxStreak,
      stars,
      timeBonus,
      total: Math.round(this.score),
    };
    this.running = false;
  }

  private setCoach(key: string, line: string, ms: number) {
    this.coach = line;
    this.coachKey = key;
    this.coachUntil = this.now + ms;
  }

  private stepCoach(time: number) {
    if (this.coach && time > this.coachUntil) {
      this.coach = null;
      this.coachKey = "";
    }
    const d = this.derived;
    const b = this.boat;
    const busy =
      this.coachKey !== "" && this.coach !== null && time < this.coachUntil;
    if (busy) {
      return;
    }
    const tryCoach = (key: string, line: string, ms = 2600) => {
      if (this.coachKey !== key) {
        this.setCoach(key, line, ms);
      }
    };

    if (b.state === "IN_IRONS") {
      tryCoach(
        "irons",
        "Stuck in irons! Push the tiller to one side and wait for the bow to swing off the wind.",
        3000
      );
    } else if (this.wrongHelmTimer > 0.5) {
      tryCoach(
        "wrong-helm",
        "Tiller the other way — push it AWAY from where you want to go.",
        2600
      );
    } else if (d.aTwa < NO_GO_HALF) {
      tryCoach(
        "nogo",
        "You're in the no-go zone — bear away from the wind to fill the sail.",
        2600
      );
    } else if (d.sheet < d.optSheet - 0.22) {
      tryCoach(
        "luff",
        "Sail's flapping — pull the mainsheet in a little until it stops.",
        2400
      );
    } else if (d.sheet > d.optSheet + 0.22 && d.aTwa > 70) {
      tryCoach(
        "tight",
        "Too tight — ease the mainsheet out until the sail stops stalling.",
        2400
      );
    } else if (d.pointOfSail === "Beam reach" && d.trimEff > 0.9) {
      tryCoach(
        "beam",
        "Nice beam reach — wind on your side, sail full. Hold this line.",
        2600
      );
    }
  }

  private nextMarkInfo(): {
    label: string;
    bearing: number;
    dist: number;
  } | null {
    if (this.targetIdx >= this.objectives.length) {
      return null;
    }
    const b = this.boat;
    const obj = this.objectives[this.targetIdx];
    const dx = obj.x - b.x;
    const dy = obj.y - b.y;
    return {
      bearing: wrap360(Math.atan2(dx, dy) * RAD2DEG),
      dist: Math.hypot(dx, dy),
      label: obj.label,
    };
  }

  private maybePublish(time: number, force: boolean) {
    if (!force && time - this.lastPublish < PUBLISH_MS) {
      return;
    }
    this.lastPublish = time;
    const b = this.boat;
    const d = this.derived;
    const nm = this.nextMarkInfo();

    const needCross =
      this.running &&
      b.state === "SAILING" &&
      !this.capsized &&
      d.aTwa > 8 &&
      this.crewSide !== this.windSide();

    let mobBearingDeg: number | null = null;
    let mobDistM: number | null = null;
    if (this.mob) {
      const dx = this.mob.x - b.x;
      const dy = this.mob.y - b.y;
      mobBearingDeg = wrap360(Math.atan2(dx, dy) * RAD2DEG);
      mobDistM = Math.hypot(dx, dy);
    }

    // nearest un-rescued drowned passenger, for the HUD guidance chip
    let rescuedCount = 0;
    let rescueBearingDeg: number | null = null;
    let rescueDistM: number | null = null;
    for (const p of this.rescues) {
      if (p.picked) {
        rescuedCount += 1;
        continue;
      }
      const dd = Math.hypot(p.x - b.x, p.y - b.y);
      if (rescueDistM === null || dd < rescueDistM) {
        rescueDistM = dd;
        rescueBearingDeg = wrap360(Math.atan2(p.x - b.x, p.y - b.y) * RAD2DEG);
      }
    }

    // drop expired floating score chips before publishing the live set
    this.popups = this.popups.filter((p) => time - p.born < POPUP_TTL_MS);
    const popups: ScorePopup[] = this.popups.map((p) => ({
      id: p.id,
      points: p.points,
      text: p.text,
    }));

    const hud: HudState = {
      absTwa: d.aTwa,
      capsized: this.capsized,
      coach: this.coach,
      crewSide: this.crewSide,
      elapsed: this.elapsed,
      headingDeg: b.heading,
      hiking: this.bridge.input.hike,
      inNoGo: d.aTwa < NO_GO_HALF,
      levelId: this.level.id,
      levelName: this.level.name,
      mobBearingDeg,
      mobDistM,
      needCross,
      nextMarkBearingDeg: nm ? nm.bearing : null,
      nextMarkDistM: nm ? nm.dist : null,
      nextMarkLabel: nm ? nm.label : null,
      objectiveIndex: Math.min(this.targetIdx, this.objectives.length),
      objectiveTotal: this.objectives.length,
      optSheet: d.optSheet,
      pointOfSail: d.pointOfSail,
      popups,
      rescueBearingDeg,
      rescueDistM,
      rescueTotal: this.rescues.length,
      rescuedCount,
      result: this.result,
      running: this.running,
      sailState: b.state,
      score: Math.round(this.score),
      sheet: d.sheet,
      showWedge: this.level.assists.showWedge,
      signedTwa: d.sTwa,
      speedKt: Math.max(0, b.speedKt),
      streakLabel: this.streakLabel(),
      streakMult: this.streakMult(),
      tack: d.tack,
      trimEff: d.trimEff,
      windDir: this.windDir,
      windSpeedKt: this.windSpeed,
    };
    this.bridge.publish(hud);
  }
}
