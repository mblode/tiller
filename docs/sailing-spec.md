# Sail — Unified Implementation Spec (Mobile Pixel-Art Dinghy Game)

> Phaser + Next.js. Portrait phone primary, desktop/landscape secondary. Goal: teach an absolute beginner real sailing concepts (no-go zone, points of sail, trim, tacking, gybing, the inverted tiller) while staying simple and fun. This is the single source of truth — it resolves every conflict between the original physics / tiller / controls / scoring / coaching drafts.

---

## 0. GLOBAL CONVENTIONS (read first — everything depends on these)

These are unified across **all** modules. There is exactly one of each.

### 0.1 World & axes
- **World is metres (m).** Headings & angles in degrees.
- **World +Y points UP (upwind / north / toward where the wind comes from). World +X points right (east).** Course coordinates (marks, start line) live in this world frame.
- **Screen/canvas +Y points DOWN** (Phaser default). The renderer applies `screenY = worldOriginY - worldY` (a single Y flip) at draw time. No gameplay math uses screen coordinates.

### 0.2 Heading
- `heading`: degrees, **0° = North/up (+Y), increasing clockwise** (90° = East/right, 180° = South/down). Range `[0,360)`.
- Phaser sprite rotation (Phaser 0 rad = +X): `phaserRad = (heading - 90) * DEG2RAD`.

### 0.3 Wind — FROM convention (the ONLY convention; was contradictory in 3 drafts)
- `windDir`: the compass bearing the wind blows **FROM**. `windDir = 0` ⇒ wind from the north, blowing toward the south. This is the sailor-standard meteorological convention and is used identically by physics, tiller, scoring, and HUD. **There is no `+180` step anywhere.**

### 0.4 True Wind Angle (TWA) — both signed and absolute
We keep true wind only (no apparent-wind feedback loop — see §13).
```js
const DEG2RAD = Math.PI / 180;
// signed shortest angle from heading to where the wind comes FROM, in (-180, +180]
function wrap180(a){ a = ((a % 360) + 360) % 360; return a > 180 ? a - 360 : a; }
function signedTWA(heading, windDir){ return wrap180(windDir - heading); }
function absTWA(heading, windDir){ return Math.abs(signedTWA(heading, windDir)); }
```
- `absTWA = 0` ⇒ pointing straight into the wind (in irons). `absTWA = 180` ⇒ dead run.
- **Sign meaning:** `signedTWA > 0` ⇒ wind comes over the **starboard** side; `signedTWA < 0` ⇒ over the **port** side. (Derivation: with `windDir` a FROM-bearing, `windDir - heading > 0` means the wind source is clockwise of the bow, i.e. to starboard.)

### 0.5 Tack naming (named for the side the wind hits)
```
signedTWA > 0  → wind over STARBOARD → boom to PORT      → STARBOARD tack
signedTWA < 0  → wind over PORT      → boom to STARBOARD  → PORT tack
absTWA  < ~3°  → HEAD_TO_WIND, boom flogs on centreline (no tack)
```
Starboard tack has right of way over port tack (used in later levels / coaching only).

### 0.6 Tiller input — REAL inverted tiller (the headline lesson; the "arcade" override is removed)
- `tiller ∈ [-1, +1]`. `-1` = push tiller fully to **PORT** (left). `+1` = push fully to **STARBOARD** (right). `0` = centred (5% dead-zone).
- **The inversion is the lesson and is implemented everywhere, including the on-screen control and glyphs.** Push the tiller to one side, the bow turns the **other** way. (See §2.1 for the load-bearing minus sign and §2.4 for the corrected physics explanation.)

### 0.7 Mainsheet input — ONE scale: `1 = sheeted IN, 0 = eased OUT`
- `sheet ∈ [0, 1]`. `0` = fully **eased/out** (boom ~85° off centreline). `1` = fully **sheeted in** (boom ~5° off centreline, near the centreline).
- This matches the physical slider metaphor (pull the rope down/in ⇒ `sheet → 1`) and `SHEET_IN_THRESHOLD = 0.7`. All trim, optimal-sheet, and crash-gybe math below use this single scale. (The old physics/scoring "1 = out" definition is dropped.)

### 0.8 Units
- Internal speed in **knots (kt)**; `1 kt = 0.514 m/s` for world-position integration (display in knots).
- `DEG2RAD = π/180`.

### 0.9 Shared constants identity (so the three drafts' duplicate names collapse to one)
- `NO_GO_HALF = 43°` (no-go half-angle) — used by physics polar, in-irons logic, HUD wedge, scoring.
- `MAX_TURN_RATE = 70 °/s` (was also called `TURN_RATE_MAX`, `MAX_YAW` — all aliases of this one value).
- `HULL_MAX_KT = 6.0` and `WIND_REF = TWS_DEFAULT = 12 kt` (one hull max, one reference wind, used by both physics and scoring).

---

## 1. WIND

| Property | Value |
|---|---|
| `windDir` | degrees FROM (default `0` = from north). Fixed per race in beginner mode. |
| `windSpeed` (TWS) | default **12 kt**; band 8–14 kt. Tutorial stages 1–4 run 8–10 kt, stages 5–6 run 12 kt. |

Optional living breeze (off in tutorial, on in score-attack):
```js
// amplitude sum = 1.8 → true range ~10.2..13.8 kt at base 12 (±1.8 kt)
function updateWind(wind, t){
  wind.speed = 12 + 1.2 * Math.sin(t*0.13) + 0.6 * Math.sin(t*0.41);
  // wind.dir = 0 + 5 * Math.sin(t*0.07); // optional ±5° shifts, score-attack only
}
```

`windFactor` scales performance with breeze, calibrated so the polar peak = full speed at `WIND_REF = 12 kt`:
```js
const WIND_REF = 12;
function windFactor(ws){ return Math.min(1.25, Math.max(0.4, Math.pow(ws / WIND_REF, 0.6))); }
// windFactor(8.7)=0.83, (12)=1.00, (13.8)=1.08
```

---

## 2. STEERING — THE INVERTED TILLER

### 2.1 Turn-rate model (forward motion)
```js
const MAX_TURN_RATE = 70;          // °/s at full helm + full authority (alias: MAX_YAW, TURN_RATE_MAX)
const SPEED_FULL_AUTHORITY = 4.0;  // kt — at/above this, rudder fully effective
const SPEED_MIN_STEERAGE   = 0.6;  // kt — below this, no steering (== IRONS_SPEED)
const AUTHORITY_CURVE_EXP  = 0.5;  // sqrt curve

// ONE authority curve, shared by all modules (replaces physics' 0.35+0.65*… and controls' 0.3+0.7*…)
function steerAuthority(speedKt){
  const a = Math.min(1, Math.max(0, (speedKt - SPEED_MIN_STEERAGE) / (SPEED_FULL_AUTHORITY - SPEED_MIN_STEERAGE)));
  return Math.pow(a, AUTHORITY_CURVE_EXP);
}

// FORWARD motion: the load-bearing minus sign. NEVER remove it.
function updateHeadingForward(heading, tiller, speedKt, dt){
  const omega = -tiller * MAX_TURN_RATE * steerAuthority(speedKt); // tiller +1 (stbd) → ω<0 → bow to port
  heading = ((heading + omega*dt) % 360 + 360) % 360;
  return { heading, omega };
}
```
- `steerAuthority(0.6) = 0`, `(2.0) ≈ 0.64`, `(≥4.0) = 1.0`. A stalled boat will not steer — this *creates* "stuck in irons".

### 2.2 Sternway / reverse-rudder (in irons recovery — now physically reachable)
When the boat makes **sternway** (`speedKt < 0`, only possible in irons per §4), water flows over the rudder backwards, so the steering sign **flips**:
```js
function updateHeadingReverse(heading, tiller, speedKt, dt){
  const revAuth = Math.min(1, Math.abs(speedKt) / 0.4);   // builds with sternway up to IRONS_STERNWAY_MAX
  const omega = +tiller * MAX_TURN_RATE * revAuth;        // minus sign DROPPED while going backwards
  heading = ((heading + omega*dt) % 360 + 360) % 360;
  return { heading, omega };
}
```
Dispatch: use `updateHeadingReverse` when `speedKt < 0`, else `updateHeadingForward`.

### 2.3 Optional rudder drag (off for beginners)
`RUDDER_DRAG_K = 0.15`: holding large `|tiller|` bleeds `0.15 * |tiller| * speed * dt` kt. Off by default.

### 2.4 The physics explanation (CORRECTED — the old chain ended on the wrong side)
> Pushing the tiller to **PORT** swings the rudder blade to **starboard**; the water deflects the **STERN to PORT**, which swings the **BOW to STARBOARD**. So: **tiller to port → bow to starboard.** "Push the tiller away from where you want to go; aim the tiller, not the bow." This matches the rules in §0.6 and the `ω = -tiller·…` code exactly.

First-run tutorial copy (exact): *"Push the tiller AWAY from where you want to go. Tiller to the left, bow swings right. It feels backwards — that's normal. Aim the tiller, not the bow."*

A "training-wheels" ghost arrow on the bow may show the resulting turn direction. **There is no setting that flips the sign.**

---

## 3. NO-GO ZONE & POINTS OF SAIL

`NO_GO_HALF = 43°` is the single boundary of "cannot sail" (the old scoring `33°` no-go and `33–42° pinching` band are dropped so the HUD wedge, physics, and scoring all agree). A real dinghy points ~43° off the true wind and tacks through ~86°.

| `absTWA` | Point of sail | Notes |
|---|---|---|
| 0–43° | **In irons / no-go** | Sails luff; near-dead-stop. Drawn as the red wedge. |
| 43–50° | **Close-hauled** | Highest you can sail; sheeted in. Best *upwind VMG* — NOT max boat speed. |
| 50–80° | Close reach | Building speed. |
| 80–100° | **Beam reach** | Fast, wind on the side. |
| 100–150° | **Broad reach** | **Fastest** for a dinghy. |
| 150–170° | Run | Slower (no spinnaker). |
| 170–180° | Dead run | Gybe-risk zone (`GYBE_ZONE = 170`). |

```js
function pointOfSailName(absTwa){
  if (absTwa < 43)  return 'In irons';
  if (absTwa < 50)  return 'Close-hauled';
  if (absTwa < 80)  return 'Close reach';
  if (absTwa < 100) return 'Beam reach';
  if (absTwa < 150) return 'Broad reach';
  return 'Run';
}
```

---

## 4. SPEED MODEL (ONE polar shared by physics & scoring)

The previous drafts had two incompatible polars (physics made close-hauled slow at 0.45; scoring made it equal-fastest at 1.00). **We use the physics shape everywhere:** reaches are fastest, close-hauled is a pointing/VMG sweet spot, not a speed peak.

### 4.1 Polar table `P(absTWA)` → multiplier [0,1] (source of truth, lerp between rows)
| TWA° | P |
|--:|--:|
| 0 | 0.00 |
| 15 | 0.00 |
| 30 | 0.02 |
| 43 | 0.05 |
| 45 | 0.45 |
| 60 | 0.78 |
| 75 | 0.92 |
| 90 | 1.00 |
| 105 | 1.00 |
| 120 | 0.97 |
| 135 | 0.88 |
| 150 | 0.74 |
| 165 | 0.66 |
| 180 | 0.62 |

```js
const POLAR = [[0,0],[15,0],[30,0.02],[43,0.05],[45,0.45],[60,0.78],[75,0.92],
  [90,1],[105,1],[120,0.97],[135,0.88],[150,0.74],[165,0.66],[180,0.62]];
function polar(absTwa){
  const t = Math.min(180, Math.max(0, absTwa));
  for (let i=1;i<POLAR.length;i++){
    if (t<=POLAR[i][0]){ const [a,va]=POLAR[i-1],[b,vb]=POLAR[i]; return va+(vb-va)*((t-a)/(b-a)); }
  }
  return POLAR.at(-1)[1];
}
```
Shape: steep wall at the no-go edge (0.05→0.45 between 43° and 45°), broad ~1.0 plateau across 80–110°, taper to 0.62 dead downwind (teaches *tacking downwind*: broad-reach + gybe beats a dead run).

> A reference formula approximation exists but only matches the table to ~**±0.11** (worst at TWA 45: table 0.45 vs formula 0.555). **Use the table in production**; do not advertise the formula as "within 0.05".

### 4.2 Target boat speed
```js
const HULL_MAX_KT = 6.0; // top speed at WIND_REF=12 kt, perfect trim, on the plateau
function targetSpeedKt(absTwa, sheet, windSpeed){
  return HULL_MAX_KT * polar(absTwa) * trimEfficiency(sheet, absTwa) * windFactor(windSpeed);
}
```
Examples @ 12 kt wind, perfect trim: beam reach (90) → 6.0 kt; broad reach (135) → 5.28 kt; close-hauled (45) → 2.7 kt; **in irons (TWA 30) → ~0.12 kt (drifts); (TWA 20) → ~0.04 kt** (corrected — the old "TWA 20 → 0.13" used the 30° value).

---

## 5. SAIL TRIM (`sheet`: 1 = in, 0 = out)

### 5.1 Optimal sheet vs TWA
Rule of thumb: optimal boom angle off centreline ≈ half the TWA, clamped 5°–85°.
```js
const BOOM_MIN = 5, BOOM_MAX = 85;
function optimalBoomAngle(absTwa){ return Math.min(BOOM_MAX, Math.max(BOOM_MIN, absTwa*0.5)); }
// sheet=1 is IN (small boom angle); sheet=0 is OUT (big boom angle):
function boomAngleToSheet(angle){ return 1 - (angle - BOOM_MIN)/(BOOM_MAX - BOOM_MIN); }
function optimalSheet(absTwa){ return boomAngleToSheet(optimalBoomAngle(absTwa)); }
```
Targets (this scale): close-hauled (45) → **0.78** (sheeted in hard), beam (90) → **0.50**, broad (135) → **0.22**, run (180) → **0.00** (fully eased). Sheet in upwind, ease out downwind.

### 5.2 Trim efficiency (asymmetric, TWA-aware; rephrased for the 1=in scale)
Two failure modes: **too eased** (sail luffs/flogs — soft penalty everywhere) and **too tight / over-sheeted** (forgiving upwind, stalls on a reach — harsh).
```js
function trimEfficiency(sheet, absTwa){
  const opt = optimalSheet(absTwa);
  const err = sheet - opt;                  // >0: too tight (sheeted in past optimal). <0: too eased.
  const tooTight = err > 0;
  let tol;
  if (!tooTight){
    tol = 0.28;                             // easing too much: gentle, you just depower
  } else {
    const reachiness = Math.min(1, Math.max(0,(absTwa-50)/70)); // 0 upwind → 1 by ~120°
    tol = 0.30 - 0.18 * reachiness;         // 0.30 upwind → 0.12 on a reach (stall)
  }
  const x = Math.abs(err)/tol;
  return Math.max(0.15, Math.exp(-0.5*x*x)); // 1.0 perfect; floor 0.15
}
```
`trimEfficiency ≥ 0.90` = "well trimmed" (drives the scoring TRIM bonus). This single function replaces scoring's separate `idealSheet`/`trimMult` (which are now defined to be consistent: `idealSheet = optimalSheet(absTwa)`, and well-trimmed ⇔ `trimEfficiency ≥ 0.90`).

---

## 6. SPEED DYNAMICS (asymmetric easing + sternway)

```js
const ACCEL_TAU = 2.8;          // s — slow to build (mass + water resistance)
const DECEL_TAU = 1.4;          // s — faster to slow down (drag)
const IRONS_STERNWAY_MAX = -0.4;// kt — wind blows you backwards when truly stuck

function updateSpeed(boat, absTwa, sheet, windSpeed, dt){
  let target = targetSpeedKt(absTwa, sheet, windSpeed);
  // Sternway: inside the no-go cone with almost no way on, wind pushes the bow back.
  if (absTwa < NO_GO_HALF && boat.speedKt < 0.3){
    const intoWind = 1 - absTwa / NO_GO_HALF;          // 1 at head-to-wind, 0 at edge
    target = IRONS_STERNWAY_MAX * intoWind;            // negative target → boat coasts backwards
  }
  const tau = (target > boat.speedKt) ? ACCEL_TAU : DECEL_TAU;
  const k = 1 - Math.exp(-dt/tau);                     // frame-rate-independent
  boat.speedKt += (target - boat.speedKt) * k;
}
```
`k = 1 - e^{-dt/tau}` is the correct frame-rate-independent easing. The sternway branch is what makes the §2.2 reverse-rudder recovery reachable (the old physics could never produce negative speed).

---

## 7. POSITION INTEGRATION (knots → world metres, +Y up)

```js
const KT_TO_MS = 0.514;
function integratePosition(boat, dt){
  const speedMs = boat.speedKt * KT_TO_MS;
  const rad = boat.heading * DEG2RAD;        // 0°=+Y(up), CW
  boat.x += Math.sin(rad) * speedMs * dt;    // +X = east
  boat.y += Math.cos(rad) * speedMs * dt;    // +Y = UP (north). NOTE: world Y up, not screen Y.
}
// Renderer: screenX = camX + (boat.x - camWorldX); screenY = camY - (boat.y - camWorldY);
```
This keeps world +Y = upwind (so WM at y=+180 is genuinely up-screen and LM at y=-120 is down-screen). The single Y flip lives only in the renderer. (Resolves the silent course-inversion bug.)

Leeway, tide, heel, apparent wind are omitted — see §13.

---

## 8. TACK / GYBE STATE MACHINE

States: `SAILING` · `TACKING` · `IN_IRONS` · `GYBING` · `CRASH_GYBE`.

### 8.1 Constants
```
NO_GO_HALF          = 43   GYBE_ZONE          = 170
TACK_DRAG           = 1.2  TACK_EXIT_SPEED_KEEP = 0.85  TACK_SWING_MS = 450
IRONS_SPEED         = 0.6  STALL_RATE = 8  STALL_HOLD = 0.4  BACK_SAIL_RATE = 12
SHEET_IN_THRESHOLD  = 0.7  GYBE_SWING_MS = 250  GYBE_SPEED_KEEP = 0.95  GYBE_LOCKOUT_MS = 250
CRASH_SWING_MS      = 90   CRASH_SPEED_KEEP = 0.6  CRASH_LOCKOUT_MS = 400  CAPSIZE_RECOVER_S = 3.0
```

### 8.2 TACK (bow through the wind, upwind — `signedTWA` crosses 0)
- **Enter TACKING:** `SAILING` AND `absTWA < NO_GO_HALF` AND moving toward the wind (`d(absTWA)/dt < 0`). Record sign of `signedTWA` at entry.
- **While TACKING:** `speedKt -= TACK_DRAG * dt`. Helm authority is whatever §2.1 gives (low because slow) — the skill is carrying speed into the tack.
- **TACK COMPLETE → SAILING:** `signedTWA` sign flipped AND `absTWA > NO_GO_HALF`. Effects: boom swing 450 ms (gentle, little load), flip `tack`/`boomSide`, `speedKt *= TACK_EXIT_SPEED_KEEP (0.85)`. No tiller lockout (player needs helm through the tack).

### 8.3 IN IRONS (failed tack)
- **Enter IN_IRONS:** `TACKING` AND `absTWA < NO_GO_HALF` AND `speedKt < IRONS_SPEED` AND `|ω| < STALL_RATE`, held `STALL_HOLD = 0.4 s`.
- **While IN_IRONS:** forward helm dead (`steerAuthority=0`), sails luff, boom flogs on centreline, sternway ramps toward `IRONS_STERNWAY_MAX = -0.4 kt` (§6).
- **Recovery (two taught techniques):**
  1. **Reverse rudder:** while `speedKt < 0`, §2.2 applies (push tiller, bow falls off the **same** side). 
  2. **Back the sail** (beginner assist button): pushes bow off the wind at `BACK_SAIL_RATE = 12 °/s` toward the chosen side until `absTWA > NO_GO_HALF`.
- **IN_IRONS → SAILING:** `absTWA > NO_GO_HALF` AND `speedKt > IRONS_SPEED`.

### 8.4 GYBE (stern through the wind, downwind — `signedTWA` crosses ±180)
- **Enter GYBING:** `SAILING` AND `absTWA > GYBE_ZONE (170)` AND bearing away (`absTWA` increasing).
- **Crossover (±180):** flip `tack`/`boomSide`. Branch on sheet state at the instant of crossing.
- **Controlled gybe (sheet IN, `sheet ≥ SHEET_IN_THRESHOLD 0.7`):** boom swing 250 ms, `speedKt *= 0.95`, tiller lockout 250 ms. No capsize.
- **Crash gybe (sheet OUT, `sheet < 0.7`):** boom slam 90 ms (screen shake + thunk), heel/knockdown spike (may capsize → upright respawn after `CAPSIZE_RECOVER_S = 3.0 s`, `speed=0`), `speedKt *= 0.6`, tiller lockout 400 ms.
  - **Note the corrected sense:** crash fires only when the sail is **eased out** (`sheet < 0.7`) at crossover — i.e. powered up. With the unified §0.7 scale, "sheeted in" is `sheet → 1`, so a properly-managed controlled gybe (e.g. `sheet = 0.9`) is safe. (Fixes the inverted crash trigger at the integration boundary.)

### 8.5 Transition table
| From | Trigger | To | Effects |
|---|---|---|---|
| SAILING | `absTWA<43` & toward wind | TACKING | tack drag −1.2 kt/s; record entry sign |
| TACKING | sign flipped & `absTWA>43` | SAILING | boom 450 ms gentle; flip tack; `speed*=0.85` |
| TACKING | `speed<0.6` & `|ω|<8` held 0.4 s | IN_IRONS | helm dead; sternway begins |
| IN_IRONS | `absTWA>43` & `speed>0.6` | SAILING | resume drive |
| SAILING | `absTWA>170` & bearing away | GYBING | watch sheet |
| GYBING | cross ±180, `sheet≥0.7` | SAILING | boom 250 ms; flip tack; `speed*=0.95`; lockout 250 ms |
| GYBING | cross ±180, `sheet<0.7` | CRASH_GYBE | boom 90 ms slam; flip tack; `speed*=0.6`; lockout 400 ms; heel spike (maybe capsize 3 s) |
| CRASH_GYBE | lockout (+capsize timer) ends | SAILING | restore control; apply buffered tiller |

### 8.6 Boom-swing animation & lockout
| Event | Swing | Easing | Tiller lockout |
|---|---|---|---|
| Tack | 450 ms | ease-in-out | none |
| Controlled gybe | 250 ms | ease-out | 250 ms |
| Crash gybe | 90 ms | linear/overshoot | 400 ms |
| In-irons flog | continuous ±10° @ ~3 Hz | sinusoidal | helm dead anyway |
During lockout, buffer the latest tiller input and apply it the instant lockout ends. `boomSide` is authoritative state; the animation only interpolates the visual `boomAngle`.

### 8.7 Lesson-tracker events
`tackStarted, tackCompleted, stuckInIrons, ironsRecovered{method:rudder|backedSail}, gybeStarted, gybeControlled, crashGybe{capsized}, wrongWayHelm`.
`wrongWayHelm` fires when, trying to bear away, the player holds the tiller the wrong way (sign of `tiller` is driving `absTWA` further toward 0) for ≥0.5 s → triggers the inversion reminder.

---

## 9. PER-FRAME UPDATE (paste-in)

```js
function updateBoat(boat, wind, tiller, sheet, t, dt){
  updateWind(wind, t);                                  // off in tutorial

  // 1. steering (reverse-rudder when making sternway), unless locked out
  if (!boat.tillerLocked){
    const r = (boat.speedKt < 0)
      ? updateHeadingReverse(boat.heading, tiller, boat.speedKt, dt)
      : updateHeadingForward(boat.heading, tiller, boat.speedKt, dt);
    boat.heading = r.heading; boat.omega = r.omega;
  }

  // 2. wind angle + speed + position
  const sTwa = signedTWA(boat.heading, wind.dir);
  const aTwa = Math.abs(sTwa);
  updateSpeed(boat, aTwa, sheet, wind.speed, dt);
  integratePosition(boat, dt);

  // 3. state machine (§8) — consumes aTwa, sign(sTwa), boat.speedKt, boat.omega, sheet
  stepStateMachine(boat, sTwa, aTwa, sheet, dt);

  // 4. UI / teaching
  boat.signedTWA   = sTwa;
  boat.absTWA      = aTwa;
  boat.inIrons     = boat.state === 'IN_IRONS';
  boat.tack        = sTwa > 3 ? 'STARBOARD' : sTwa < -3 ? 'PORT' : 'HEAD_TO_WIND';
  boat.boomSide    = boat.tack === 'STARBOARD' ? 'PORT' : boat.tack === 'PORT' ? 'STARBOARD' : 'CENTER';
  boat.trimEff     = trimEfficiency(sheet, aTwa);
  boat.optSheet    = optimalSheet(aTwa);
  boat.pointOfSail = pointOfSailName(aTwa);
}
```

---

## 10. MOBILE CONTROLS & HUD

### 10.1 Layout (portrait, reference 390×844 CSS px; pixel-art ~130×281 art px @3× nearest-neighbour)
| Band | Height | Contents |
|---|---|---|
| **Top HUD** | safe-top + 64px | Wind rose + wind speed (left), Score (centre), Boat speed (right) |
| **Play zone** | flex (~520px) | Water, boat, ripples, no-go wedge, mark line. **No controls here.** |
| **Sub-HUD** | 28px | Tack badge (left), Point-of-sail label (centre), sheet quick-state (right) |
| **Bottom bar** | 168px + safe-bottom | Tiller (wide, centred) + Mainsheet (vertical, right edge) |

Boat is camera-clamped to the central 60% "safe box"; HUD bars sit above/below the play zone so they never occlude the boat. Off-screen mark → edge-pinned chevron + distance; on-screen → dashed bow→buoy line.

Landscape/desktop: thinner top bar; tiller → bottom-left cluster, mainsheet → bottom-right. Keyboard fallback: A/D or ←/→ = tiller (auto-centre on key-up), W/S or ↑/↓ = sheet in/out (held). `R` = restart stage, `Esc` = stage select.

### 10.2 Tiller control (inverted — matches §0.6/§2)
- Wide draggable handle in the bottom bar: track = `screenW − 84px`, handle 56×56px (hit area 72×72). Horizontal drag only; tap-to-position then track. Own pointer ID (two-thumb safe).
- Mapping with 5% dead-zone:
```js
const DEAD = 0.05;
let norm = clamp((pointerX - center)/halfTravel, -1, 1);
tiller = Math.abs(norm) < DEAD ? 0 : Math.sign(norm)*(Math.abs(norm)-DEAD)/(1-DEAD);
```
- **The control is genuinely reversed.** Glyphs/labels teach it: handle dragged right ⇒ a ghost bow-arrow shows the bow swinging LEFT. Handle tints port-red on the left half, starboard-green on the right half (neutral grey at centre). No live numeric. (The "arcade convention" from the controls draft is removed; turn rate comes from §2.1, not a separate `0.3+0.7*speedFactor`.)
- Self-centring: on release, handle springs to centre over 220 ms (easeOutCubic) and `tiller` lerps to 0. Optional "tiller holds position" toggle (off by default).

### 10.3 Mainsheet control (`1 = in/down`, `0 = out/up` — matches §0.7)
- Vertical slider on the right: 72×156px, handle 52×52 (hit 72×72), Y-only, own pointer ID. Holds position on release (you hold a trim).
- Mapping — **down = sheet in = 1**:
```js
const travel = trackBottom - trackTop;
sheet = (pointerY - trackTop) / travel;   // top=0 (out/eased) … bottom=1 (in/trimmed)
```
- **Green "groove" band** drawn at `optimalSheet(absTWA)` (recomputed each frame; ~18px tolerance window ≈ the trimEfficiency≥0.90 zone). Handle in the groove ⇒ glows green, sail tells go taut. Above groove (too eased) ⇒ leech flutters "flap flap". Below groove (over-sheeted) ⇒ sail goes flat/dark, speed bleeds. A ghost tick always marks optimal. Track drawn as coiled rope; slack above the cleat, taut below; "SHEET" label + "IN ↓ / OUT ↑" glyphs.

### 10.4 HUD elements
**Top:** Wind rose (56×56, north-up, rotating FROM-arrow, red no-go wedge ±43° on the upwind side, white boat-heading triangle that flashes inside the wedge) · `12 kn` + `WIND N` cardinal · `SCORE` + monospace value · `5.4 kn` + `SPEED` (green near polar-optimal for the angle, amber when slow/luffing).
**Sub-HUD:** tack badge `[P]` red (port tack) / `[S]` green (starboard) plus a left/right chevron · point-of-sail label (pulses on change) · `[M]` sheet quick-state (green in groove).
**On-water:** wind ripples drift in the wind direction at speed ∝ kt; semi-transparent red no-go wedge projected upwind from the boat (brightens as warning); dashed bow→mark line + bobbing buoy + optional laylines; masthead burgee shows apparent-ish wind direction (cosmetic); 1px speed-scaled wake.

### 10.5 Accessibility
- Pixel/bitmap font, cap-height ≥16 CSS px for primary values, ≥12px labels; monospace digits.
- Nav colour code: **port=red, starboard=green**, no-go=red, optimal/good=green, warning=amber, neutral=wood/grey. Never colour-only — pair with shape/letters/position. Colour-blind palette toggle (port=blue-violet / starboard=orange).
- Touch targets ≥44px visible / ≥72px hit; ≥24px between handles.
- `prefers-reduced-motion` honoured (+ in-game toggle): freeze/slow ripples, kill gust flicker/luff flutter/wake/heel-offset/screen-pulse; keep functional motion (boat turning, handle spring).
- Optional haptics: light tick at tiller centre detent and when sheet enters the groove (respects a haptics-off setting).
- HUD text gets a 1px dark outline/scrim for legibility over bright water.

### 10.6 Control mapping summary
| Control | Input | Output | Range | Neutral |
|---|---|---|---|---|
| Tiller | horizontal drag (X only), tap-to-position | `tiller` (inverted) | −1 hard port … +1 hard starboard, 5% dead-zone | springs to 0 over 220 ms |
| Mainsheet | vertical drag (Y only), down = in | `sheet` | 0 eased/out … 1 sheeted/in | holds; green groove = optimal |

---

## 11. COURSE — Windward/Leeward (world frame, +Y up = upwind)

Wind from the top (`windDir = 0`). Start/finish at the bottom (downwind), windward mark at the top. Symmetric about the Y axis, so one tack up and one gybe down are both unavoidable.

| ID | Name | Pos (x,y) m | Radius R | Rule |
|---|---|---|---|---|
| SP | Start pin (left) | (−25, −20) | line | Cross line heading +Y (upwind) to start/finish |
| SB | Start boat (right) | (+25, −20) | line | — |
| WM | Windward mark | (0, +180) | **8 m** | Round to **PORT** (mark on your left), upwind→downwind side |
| LM | Leeward mark | (0, −120) | **8 m** | Round to **PORT**, gybe around heading back up |
| FIN | Finish | line y=−20 | line | Re-cross start/finish line in +Y after rounding LM |

**Leg order (1 lap):** Start (cross y=−20 moving +Y) → beat to WM (WM is dead upwind, so you must tack; cannot lay at 43°) → round WM to port, bear away → run/broad-reach to LM (sail angled, must gybe to swap broad reaches) → round LM to port → finish by re-crossing y=−20 in +Y.

**Rounding detection (all true):** closest-approach distance ≤ R(8 m); correct side (at closest approach the mark is on the boat's **port** side — cross-product sign of (mark→boat) vs heading); heading actually sweeps the arc inbound→outbound (you went *around*, not just touched). Wrong side / radius miss → off-course penalty, mark stays un-rounded.

---

## 12. SCORING

Integer total, starts at 0, displayed live. **Score floor = 0 in tutorial stages** (`SCORE_FLOOR_TUT = 0`); no floor in score-attack.

### 12.1 Positive
| Event | Points |
|---|---|
| Clean start (cross within 5 s of gun, on course) | +100 |
| Round WM correctly | +250 |
| Round LM correctly | +250 |
| Cross FIN correctly | +200 |
| Successful TACK (clean cross of head-to-wind, regain >3 kt within 4 s, no irons) | +75 (+50 first of race) |
| Successful GYBE (controlled, no crash) | +75 (+50 first of race) |
| **TRIM bonus** | +2/sec while `trimEfficiency ≥ TRIM_GOOD (0.90)` AND not in no-go (× streak mult) |
| Time bonus (end) | `max(0, (TARGET_TIME − elapsed) * 20)`, cap +1500. `TARGET_TIME = 150 s`. |

### 12.2 Streak (good point of sail)
Good tick = in a named sailing band (close-hauled / close reach / beam / broad / run — NOT in-irons/no-go) AND `trimEfficiency ≥ STREAK_GOOD (0.85)`. Increments per second of continuous good ticks; resets to 0 on any penalty or no-go entry.
- 0–4 s ×1.0 · 5–9 s ×1.5 "Trimmed!" · 10–19 s ×2.0 "In the groove!" · 20 s+ ×3.0 "Locked in!"
- 12 s streak ⇒ TRIM bonus = 2 × 2.0 = 4 pts/sec.

### 12.3 Penalties
| Event | Points | Time | Trigger |
|---|---|---|---|
| Stuck in irons | −10/sec (max −150/episode) | +4 s recovery | state == IN_IRONS (`absTWA<43`, speed<IRONS_SPEED 0.6, held per §8.3) |
| No-go sailing | −3/sec | speed bleeds | `absTWA < NO_GO_HALF (43)` while moving (warning chevrons) |
| Crash gybe | −100 flat | +3 s capsize freeze | uncontrolled gybe: cross ±180 with **`sheet < 0.7` (eased out)** at speed >4 kt & high turn rate |
| Off-course / missed mark | −75 | resail | wrong side or beyond R without rounding |
| Over-early start (OCS) | −50 + return behind line | adds time | crossing before gun |
| Capsize | −100 | +5 s | later stages only; from crash gybe / extreme over-trim in gust |

> Crash-gybe trigger restated on the unified scale: **`sheet < SHEET_IN_THRESHOLD (0.7)` means eased out / powered** (the dangerous state). A controlled gybe sheets in (`sheet ≥ 0.7`). No-go and in-irons thresholds both key off `NO_GO_HALF = 43` (scoring's old 33° is gone).

### 12.4 Telemetry per race
`elapsedTime, timeInNoGo, timeInIrons, avgTrimEff, maxStreak, tackCount, cleanTacks, gybeCount, cleanGybes, crashGybes, offCourseCount, marksRounded[], total, stars`.

---

## 13. TUTORIAL / LEVEL PROGRESSION (6 stages)

Each stage 30–90 s, gated on explicit criteria, retry on fail. Persistent wind arrow + point-of-sail dial (clock face, no-go red, sweet spots green). Wind 8–10 kt stages 1–4, 12 kt stages 5–6.

1. **Read the Wind** — teaches wind direction/speed, bow/stern, port/starboard. Point the bow at 3 targets (upwind, port, starboard) by steering only; hold ±10° for 1.5 s each. +50 each (+150).
2. **The No-Go Zone** — steer into no-go (`absTWA<43`), feel the stall, recover to `absTWA 43–50` with speed >3 kt, once to each tack. +60 each (+120). Irons penalty shown but waived.
3. **Points of Sail & Trim** — hit & hold close-hauled (~45°), beam (~90°), broad (~135°) with `trimEfficiency ≥ 0.90` for 3 s each; "WELL TRIMMED" + green gauge. +80 each (+240); introduces live TRIM bonus + STREAK meter.
4. **Tacking Upwind** — WM dead upwind; sail close-hauled on starboard, **tack** to port, round WM to port within 8 m. ≥1 clean tack + round WM. +75 (+50 first) + 250. Irons penalty now live (−10/s).
5. **Gybing Downwind** — bear away, run to LM dead downwind, **controlled gybe** to round LM to port. Crash gybe fires −100 + freeze + tip. +75 (+50 first) + 250. Wind 12 kt.
6. **Full Lap Race** (graduation) — full §11 course vs `TARGET_TIME = 150 s`. Full §12 scoring live (time bonus, all penalties incl. capsize, streaks). Win = finish having rounded both marks.

Optional **Stage 7+ (endless / score-attack):** same course, no score floor, wind gusts ±1.8 kt and shifts ±10°, leaderboard.

### 13.1 Win / Lose / Restart
- **Tutorial win:** meet criteria → "Stage Complete" card → auto-advance. Stars: ★ passed · ★★ no penalties · ★★★ no penalties + sustained tier-2 streak.
- **Race win:** cross FIN having legally rounded WM + LM.
- **Soft fail (tutorial, no hard game-over):** stuck in irons >15 s continuous, OR >60 m outside course box for >5 s, OR stage soft-timer (`STAGE_TIME_CAP = 120 s`) expires without meeting criteria. Offers retry.
- **Race:** no hard loss; DNF only if you quit.
- **State machine:** `Title → Stage Select → Stage Intro → Sailing → (win) Result card → Next/Select | (fail) Fail card → Retry/Select`. Retry reloads identical deterministic wind/marks, resets stage score to 0, keeps best-score/best-stars in local storage. `R` = restart stage, `Esc` = stage select.

### 13.2 Result card
Headline + total + stars · elapsed vs target + time bonus · breakdown (marks, manoeuvres, trim bonus w/ avg streak, time bonus, penalties in red) · 1–3 coaching lines (always one positive first) · personal-best badge · `Retry · Next · Stage Select`.

Coaching-line rules (from telemetry): `timeInNoGo>5s` → "Watch the no-go zone — bear away to ~45°." · `avgTrimEff<0.8` → "Trim your mainsheet to the green zone for more speed." · `crashGybes>0` → "Slow your downwind turns to avoid crash gybes." · clean fast high-trim tacks → "Great upwind work — clean laylines."

---

## 14. REAL-TIME COACH PROMPTS (one line, ~3 s)

| Trigger | Line |
|---|---|
| Entering no-go (`absTWA<43`, sails flap) | "You're in the no-go zone — bear away from the wind to fill the sail." |
| Stuck in irons (IN_IRONS) | "Stuck in irons! Push the tiller to one side and wait for the bow to swing off the wind." |
| Approaching WM on a beat (<2 boat-lengths) | "Time to TACK — push the tiller away, swap sides as the boom crosses." |
| Approaching LM on a run/broad reach (<2 boat-lengths) | "Prepare to GYBE — sheet in, turn the stern through the wind, then ease out." |
| Good beam reach, well trimmed | "Nice beam reach — wind on your side, sail full. Hold this line." |
| Sail luffing (too eased) | "Sail's flapping — pull the mainsheet in a little until it stops." |
| Oversheeted (too tight, stalling) | "Too tight — ease the mainsheet out until the front edge just stops flapping." |
| Crossed onto port tack | "Now on PORT tack — wind's over your left. Give way to starboard-tack boats." |
| Crossed onto starboard tack | "Now on STARBOARD tack — wind's over your right. You have right of way." |
| Building good speed | "Great speed — sail's trimmed sweet. Keep her steady." |
| wrongWayHelm (held wrong tiller ≥0.5 s) | "Tiller the other way — push it AWAY from where you want the bow to go." |

---

## 15. GLOSSARY (in-game)

- **Wind direction** — Where the wind blows *from*. Find it first (flags, ripples, the on-screen arrow).
- **Knots** — Speed; 1 knot ≈ 1.15 mph.
- **Main sail** — The big sail behind the mast, on the boom. Your power.
- **Jib** — The smaller front sail (not modelled in v1; glossary only).
- **Port** — LEFT side facing the bow. **Red**.
- **Starboard** — RIGHT side facing the bow. **Green**.
- **Bow / Stern** — Front (pointy) / back of the boat.
- **No-go zone** — The ~43° wedge either side of straight-into-wind where you can't sail; sails flap. Steer out.
- **Points of sail** — No-go, close-hauled (upwind), close/beam/broad reach (sideways→fast), run (downwind).
- **Beam reach** — Wind on the side (~90°). Usually fastest and easiest.
- **Tacking** — Turning the **bow** *through* the wind to switch sides; zig-zag upwind.
- **Gybing** — Turning the **stern** *through* the wind to switch sides downwind. Boom swings fast — duck!
- **Tiller** — The steering arm on the rudder. **Push it AWAY to turn the bow toward you** (it feels backwards — that's the lesson). The extension is the hinged handle to steer from the side.
- **Mainsheet** — The rope controlling the main sail. Pull **in** (down) to tighten, ease **out** (up) to depower.

**Tack vs gybe:** tack = nose to wind (upwind); gybe = tail to wind (downwind), boom swings hard — sheet in, cross, ease out.

---

## 16. DELIBERATELY OMITTED (v1)

Heel/capsize physics (only a cosmetic lean + crash-gybe knockdown); leeway/sideslip (boat moves exactly along heading); **apparent wind** (drive everything off true wind — the polar already bakes in "reaching is fastest"); tide/current (add later as constant `(vx,vy)` in §7); full hydrodynamics (replaced by §6 asymmetric easing); the jib (single mainsheet only). The masthead burgee in §10.4 is cosmetic, not a second wind input.

---

## 17. TUNING CHEAT-SHEET

| Want… | Change |
|---|---|
| Harder no-go | raise `NO_GO_HALF` to 45–48, drop the 45° polar row toward 0.35 |
| Heavier boat | raise `ACCEL_TAU` (3.5) and `DECEL_TAU` (1.8) |
| More arcade | lower both `*_TAU` to ~1.0, raise `MAX_TURN_RATE` |
| Trim matters more | shrink `tol` values in `trimEfficiency`, lower the 0.15 floor, lower `TRIM_GOOD` |
| Bigger/faster world | raise `HULL_MAX_KT` (rescale `TARGET_TIME`) |
| Reward downwind gybing | lower the 180° polar row (e.g. 0.55) so broad reaching clearly beats a dead run |
