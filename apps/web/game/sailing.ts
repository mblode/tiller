// Pure sailing math — no Phaser, no DOM. Faithful to docs/sailing-spec.md.

import {
  AUTHORITY_CURVE_EXP,
  BOOM_MAX,
  BOOM_MIN,
  HULL_MAX_KT,
  NO_GO_HALF,
  OPTIMAL_BOOM_FACTOR,
  POLAR,
  REACHINESS_SPAN,
  REACHINESS_START_TWA,
  SPEED_FULL_AUTHORITY,
  SPEED_MIN_STEERAGE,
  TRIM_EFF_FLOOR,
  TRIM_TOL_EASED,
  TRIM_TOL_TIGHT_REACH,
  TRIM_TOL_TIGHT_UPWIND,
  WIND_FACTOR_EXP,
  WIND_FACTOR_MAX,
  WIND_FACTOR_MIN,
  WIND_REF,
} from "./constants";

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Wrap an angle into (-180, 180]. */
export function wrap180(a: number): number {
  const m = ((a % 360) + 360) % 360;
  return m > 180 ? m - 360 : m;
}

/** Wrap into [0, 360). */
export function wrap360(a: number): number {
  return ((a % 360) + 360) % 360;
}

/**
 * Signed true wind angle: shortest angle from heading to where the wind comes
 * FROM, in (-180, 180]. >0 ⇒ wind over starboard; <0 ⇒ wind over port.
 */
export function signedTWA(heading: number, windDir: number): number {
  return wrap180(windDir - heading);
}

export function absTWA(heading: number, windDir: number): number {
  return Math.abs(signedTWA(heading, windDir));
}

export function pointOfSailName(aTwa: number): string {
  if (aTwa < NO_GO_HALF) {
    return "In irons";
  }
  if (aTwa < 50) {
    return "Close-hauled";
  }
  if (aTwa < 80) {
    return "Close reach";
  }
  if (aTwa < 100) {
    return "Beam reach";
  }
  if (aTwa < 150) {
    return "Broad reach";
  }
  return "Run";
}

/** Polar speed multiplier [0,1] for an absolute TWA, linear-interpolated. */
export function polar(aTwa: number): number {
  const t = clamp(aTwa, 0, 180);
  for (let i = 1; i < POLAR.length; i += 1) {
    const [b, vb] = POLAR[i];
    if (t <= b) {
      const [a, va] = POLAR[i - 1];
      return va + (vb - va) * ((t - a) / (b - a));
    }
  }
  const last = POLAR.at(-1);
  return last ? last[1] : 1;
}

export function windFactor(windSpeed: number): number {
  return clamp(
    (windSpeed / WIND_REF) ** WIND_FACTOR_EXP,
    WIND_FACTOR_MIN,
    WIND_FACTOR_MAX
  );
}

/** Optimal boom angle off centreline (deg) ≈ half the TWA, clamped. */
export function optimalBoomAngle(aTwa: number): number {
  return clamp(aTwa * OPTIMAL_BOOM_FACTOR, BOOM_MIN, BOOM_MAX);
}

function boomAngleToSheet(angle: number): number {
  return 1 - (angle - BOOM_MIN) / (BOOM_MAX - BOOM_MIN);
}

/** Optimal mainsheet value (1 = in) for an angle. */
export function optimalSheet(aTwa: number): number {
  return boomAngleToSheet(optimalBoomAngle(aTwa));
}

/**
 * Trim efficiency [0.15, 1]. Asymmetric: easing too much depowers gently;
 * over-sheeting is forgiving upwind but stalls hard on a reach.
 */
export function trimEfficiency(sheet: number, aTwa: number): number {
  const opt = optimalSheet(aTwa);
  const err = sheet - opt; // >0: too tight; <0: too eased
  let tol: number;
  if (err <= 0) {
    tol = TRIM_TOL_EASED;
  } else {
    const reachiness = clamp(
      (aTwa - REACHINESS_START_TWA) / REACHINESS_SPAN,
      0,
      1
    );
    tol =
      TRIM_TOL_TIGHT_UPWIND -
      (TRIM_TOL_TIGHT_UPWIND - TRIM_TOL_TIGHT_REACH) * reachiness;
  }
  const x = Math.abs(err) / tol;
  return Math.max(TRIM_EFF_FLOOR, Math.exp(-0.5 * x * x));
}

/** Steering authority [0,1] as a function of boat speed. */
export function steerAuthority(speedKt: number): number {
  const a = clamp(
    (speedKt - SPEED_MIN_STEERAGE) /
      (SPEED_FULL_AUTHORITY - SPEED_MIN_STEERAGE),
    0,
    1
  );
  return a ** AUTHORITY_CURVE_EXP;
}

/** Target boat speed (kt) for an angle, trim and wind. */
export function targetSpeedKt(
  aTwa: number,
  sheet: number,
  windSpeed: number
): number {
  return (
    HULL_MAX_KT *
    polar(aTwa) *
    trimEfficiency(sheet, aTwa) *
    windFactor(windSpeed)
  );
}
