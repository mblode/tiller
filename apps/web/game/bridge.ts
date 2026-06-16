import type { GameInput, GameMode, HudState } from "./types";

/**
 * A tiny pub/sub bridge between the Phaser scene and the React HUD.
 *  - React controls call `setInput` (no re-render of the canvas).
 *  - The scene calls `publish` (throttled) with a fresh HudState snapshot.
 *  - React subscribes via `useSyncExternalStore`.
 */
export class GameBridge {
  input: GameInput = {
    backSail: false,
    hike: false,
    paused: false,
    sheet: 0.5,
    tiller: 0,
  };

  // Imperative commands the React shell issues; the scene drains these.
  command: {
    restart: number;
    setMode: GameMode | null;
    resume: number;
    crossSide: number;
  } = {
    crossSide: 0,
    restart: 0,
    resume: 0,
    setMode: null,
  };

  requestCrossSide() {
    this.command = { ...this.command, crossSide: this.command.crossSide + 1 };
  }

  private state: HudState = initialHud("practice");
  private listeners = new Set<() => void>();

  setInput(partial: Partial<GameInput>) {
    this.input = { ...this.input, ...partial };
  }

  requestRestart() {
    this.command = { ...this.command, restart: this.command.restart + 1 };
  }

  requestMode(mode: GameMode) {
    this.command = {
      ...this.command,
      restart: this.command.restart + 1,
      setMode: mode,
    };
  }

  publish(state: HudState) {
    this.state = state;
    for (const l of this.listeners) {
      l();
    }
  }

  getSnapshot = (): HudState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
}

export function initialHud(mode: GameMode): HudState {
  return {
    absTwa: 0,
    capsized: false,
    coach: null,
    crewSide: 1,
    elapsed: 0,
    headingDeg: 0,
    hiking: false,
    inNoGo: true,
    mobBearingDeg: null,
    mobDistM: null,
    mode,
    needCross: false,
    nextMarkBearingDeg: null,
    nextMarkDistM: null,
    nextMarkLabel: null,
    optSheet: 0.5,
    pointOfSail: "In irons",
    result: null,
    running: false,
    sailState: "SAILING",
    score: 0,
    sheet: 0.5,
    signedTwa: 0,
    speedKt: 0,
    streakLabel: "",
    streakMult: 1,
    tack: "HEAD_TO_WIND",
    trimEff: 0,
    windDir: 0,
    windSpeedKt: 12,
  };
}
