import * as THREE from "three";

import { BOOM_MAX, BOOM_MIN, DEG2RAD } from "../constants";
import type { BoatView } from "../types";

// Local model frame (before the group's yaw):
//   forward = -Z (bow), up = +Y, starboard = +X.
// World heading 0 (north) maps to -Z; the scene yaws the group by -heading.

// Bright, warm-wood palette so the boat pops against a deep-blue sea
// (tinywind look). Light hull, lighter deck, near-white sails.
const WOOD = 0xb5_82_4e; // hull topsides
const WOOD_DARK = 0x7a_52_2e; // mast, boom, spars
const DECK = 0xd8_a8_66; // sunlit deck
const COCKPIT = 0x8a_5e_34; // open cockpit floor
const SAIL = 0xf7_f1_e3; // bright cream sailcloth
const SAIL_EMISSIVE = 0x2a_24_18; // faint warm self-light so sails stay readable
const SKIN = 0xe8_b8_8a; // crew heads/hands
const HELM_SHIRT = 0xc8_3a_3a; // helm torso
const CREW_SHIRT = 0x2f_6f_b5; // crew torso

const MAST_H = 5.4;
const BOOM_Z = 2.4; // clew distance aft of the mast
const MAST_Z = -0.6; // mast sits forward of centre
const BOW_Z = -3;

// Crew geometry. Rail half-beam is where the bodies perch; hiking pushes them
// further outboard and leans their torsos out over the water.
const RAIL_X = 1.35;
const RAIL_Y = 0.7;
const HIKE_OUT = 0.55; // extra outboard offset when hiking
const HIKE_LEAN = 0.7; // torso lean (rad) when hiking
const CREW_SLIDE_TAU = 0.09; // ~300-400ms slide across to the new rail

interface SailMesh {
  mesh: THREE.Mesh;
  geom: THREE.BufferGeometry;
  base: Float32Array; // flat (no belly) vertex positions
  setShape: (bellyX: number, flutter: number) => void;
}

/**
 * A curved triangular sail. `tack`/`head`/`clew` are the three corners in the
 * sail's pivot-local frame; the surface bellies out along +X by `bellyX`.
 */
function makeSail(
  tack: THREE.Vector3,
  head: THREE.Vector3,
  clew: THREE.Vector3,
  color: number
): SailMesh {
  // Two triangles sharing a leech midpoint we can bulge to leeward.
  const mid = new THREE.Vector3().addVectors(head, clew).multiplyScalar(0.5);
  const verts = [tack, head, mid, tack, mid, clew];
  const base = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i += 1) {
    const v = verts[i];
    base[i * 3] = v.x;
    base[i * 3 + 1] = v.y;
    base[i * 3 + 2] = v.z;
  }
  const geom = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(base), 3);
  geom.setAttribute("position", pos);
  geom.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: SAIL_EMISSIVE,
    flatShading: true,
    metalness: 0,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = false;

  // indices of vertices that should bulge: the two "mid" entries (2 and 5)
  const setShape = (bellyX: number, flutter: number) => {
    const arr = pos.array as Float32Array;
    for (let i = 0; i < verts.length; i += 1) {
      // Fast, ragged ripple along the leech so a luffing sail visibly flaps.
      const wobble = flutter * Math.sin(i * 2.3 + flutter * 9);
      const isMid = i === 2 || i === 5;
      arr[i * 3] = base[i * 3] + (isMid ? bellyX : bellyX * 0.4) + wobble;
      // a touch of vertical shiver too, so the cloth shakes rather than slides
      arr[i * 3 + 1] = base[i * 3 + 1] + (isMid ? flutter * 0.35 : 0);
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  };
  setShape(0.6, 0);
  return { base, geom, mesh, setShape };
}

/**
 * A simple low-poly sailor: box torso + sphere head, with a small forward-lean
 * pivot at the hips so hiking reads as leaning out over the rail.
 */
function makeCrew(shirt: number): { group: THREE.Group; lean: THREE.Group } {
  const group = new THREE.Group();
  const lean = new THREE.Group(); // pivots at the hips
  const mat = new THREE.MeshStandardMaterial({
    color: shirt,
    flatShading: true,
    roughness: 0.85,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: SKIN,
    flatShading: true,
    roughness: 0.8,
  });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.4), mat);
  torso.position.y = 0.35;
  lean.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), skinMat);
  head.position.y = 0.86;
  lean.add(head);

  // legs reach inboard toward the cockpit (the feet hook the toe-strap)
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.7), mat);
  legs.position.set(0, -0.05, 0);
  group.add(legs);

  group.add(lean);
  return { group, lean };
}

export class BoatModel {
  readonly group = new THREE.Group();
  private rig = new THREE.Group(); // heels with the boat
  private mainPivot = new THREE.Group(); // swings to trim the main
  private jibPivot = new THREE.Group();
  private main: SailMesh;
  private jib: SailMesh;
  private hull: THREE.Mesh;
  private flag: THREE.Mesh;
  private crewA: { group: THREE.Group; lean: THREE.Group };
  private crewB: { group: THREE.Group; lean: THREE.Group };
  private boomLateral = -30; // signed boom angle (deg), animated
  private heel = 0;
  private crewX = -RAIL_X; // animated crew lateral position (slides on flip)
  private hikeAmt = 0; // 0..1 hiking blend
  private capsizeRoll = 0; // animated capsize roll (rad)

  constructor() {
    this.hull = makeHull();
    this.rig.add(this.hull);

    // mast
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, MAST_H, 6),
      new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.8 })
    );
    mast.position.set(0, MAST_H / 2, MAST_Z);
    this.rig.add(mast);

    // main sail + boom, on a pivot at the mast base
    const boom = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, BOOM_Z + 0.4),
      new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.8 })
    );
    boom.position.set(0, 0.5, MAST_Z + BOOM_Z / 2);
    this.mainPivot.add(boom);
    this.main = makeSail(
      new THREE.Vector3(0, 0.5, MAST_Z),
      new THREE.Vector3(0, MAST_H - 0.2, MAST_Z),
      new THREE.Vector3(0, 0.7, MAST_Z + BOOM_Z),
      SAIL
    );
    this.mainPivot.add(this.main.mesh);
    this.mainPivot.position.set(0, 0, MAST_Z);
    this.main.mesh.position.z -= MAST_Z;
    boom.position.z -= MAST_Z;
    this.rig.add(this.mainPivot);

    // jib, forward of the mast
    this.jib = makeSail(
      new THREE.Vector3(0, 0.4, BOW_Z),
      new THREE.Vector3(0, MAST_H * 0.78, MAST_Z - 0.1),
      new THREE.Vector3(0, 0.5, MAST_Z - 0.6),
      SAIL
    );
    this.jibPivot.add(this.jib.mesh);
    this.jibPivot.position.set(0, 0, BOW_Z);
    this.jib.mesh.position.z -= BOW_Z;
    this.rig.add(this.jibPivot);

    // little flag at the masthead
    this.flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.5),
      new THREE.MeshStandardMaterial({
        color: 0xe6_3a_3a,
        roughness: 1,
        side: THREE.DoubleSide,
      })
    );
    this.flag.position.set(0.5, MAST_H - 0.1, MAST_Z);
    this.rig.add(this.flag);

    // two crew on the windward rail (helm aft, crew forward).
    this.crewA = makeCrew(HELM_SHIRT);
    this.crewA.group.position.set(-RAIL_X, RAIL_Y, 0.8);
    this.rig.add(this.crewA.group);
    this.crewB = makeCrew(CREW_SHIRT);
    this.crewB.group.position.set(-RAIL_X, RAIL_Y, -0.6);
    this.rig.add(this.crewB.group);

    this.group.add(this.rig);

    // soft blob shadow on the water
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 24),
      new THREE.MeshBasicMaterial({
        color: 0x00_10_1c,
        depthWrite: false,
        opacity: 0.28,
        transparent: true,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0.4, 0.02, 0.6);
    shadow.scale.set(1.2, 1.9, 1);
    this.group.add(shadow);
  }

  update(p: BoatView) {
    // yaw: heading 0 = forward(-Z); flip sign so the bow points where you sail
    this.group.rotation.y = -p.heading * DEG2RAD;

    const luffing = p.sailState === "IN_IRONS" || p.tack === "HEAD_TO_WIND";
    // leeward side: wind over starboard (STARBOARD tack) -> boom to port (-X)
    const lee = p.tack === "STARBOARD" ? -1 : 1;
    const sheetAngle = BOOM_MIN + (1 - p.sheet) * (BOOM_MAX - BOOM_MIN);
    const desired = luffing ? Math.sin(p.nowMs / 90) * 10 : lee * sheetAngle;
    let tau = 0.18;
    if (p.sailState === "CRASH_GYBE") {
      tau = 0.05;
    } else if (p.sailState === "GYBING") {
      tau = 0.16;
    } else if (p.sailState === "TACKING") {
      tau = 0.28;
    }
    this.boomLateral +=
      (desired - this.boomLateral) * Math.min(1, (1 / tau) * p.dtSec);

    // swing the rig: positive boomLateral (starboard, +X) => rotate so the
    // boom/sail go to +X. Rotation about +Y sends +Z(aft) toward -X, so negate.
    const rot = -this.boomLateral * DEG2RAD;
    this.mainPivot.rotation.y = rot;
    this.jibPivot.rotation.y = rot * 0.7;

    // Sail feedback: luffing -> strong, fast flutter and a near-flat sail so the
    // player reads "stalled, bear away". Drawing -> taut, full belly to leeward.
    const flutterAmp = luffing ? 0.55 : 0;
    const mainFlutter = flutterAmp * Math.sin(p.nowMs / 38);
    const jibFlutter = flutterAmp * Math.sin(p.nowMs / 33 + 1.1);
    const bellyX = (luffing ? 0.08 : 0.95) * (this.boomLateral >= 0 ? 1 : -1);
    this.main.setShape(bellyX, mainFlutter);
    this.jib.setShape(bellyX * 0.7, jibFlutter);

    // ---- crew: slide to the windward rail, hike out, counter heel ----
    const targetX = p.crewSide * RAIL_X;
    this.crewX +=
      (targetX - this.crewX) * Math.min(1, (1 / CREW_SLIDE_TAU) * p.dtSec);
    const hikeTarget = p.hiking && !p.capsized ? 1 : 0;
    this.hikeAmt += (hikeTarget - this.hikeAmt) * Math.min(1, 6 * p.dtSec);

    // outboard direction equals the sign of the rail they sit on
    const outSign = this.crewX >= 0 ? 1 : -1;
    const outboardX = this.crewX + outSign * HIKE_OUT * this.hikeAmt;
    // lean torso out over the water (rotate about Z; +X rail leans toward +X)
    const leanRot = -outSign * HIKE_LEAN * this.hikeAmt;
    // small fore/aft bob so hiking looks alive
    const bob = this.hikeAmt * Math.sin(p.nowMs / 220) * 0.04;

    this.crewA.group.position.x = outboardX;
    this.crewA.group.position.y = RAIL_Y - this.hikeAmt * 0.12 + bob;
    this.crewA.lean.rotation.z = leanRot;
    this.crewB.group.position.x = outboardX;
    this.crewB.group.position.y = RAIL_Y - this.hikeAmt * 0.12 - bob;
    this.crewB.lean.rotation.z = leanRot;

    // ---- heel: roll the rig+hull to leeward; hiking counters it ----
    const heelTarget = p.heel * (1 - 0.55 * this.hikeAmt);
    this.heel += (heelTarget - this.heel) * Math.min(1, 4 * p.dtSec);

    // ---- capsize: roll the whole boat onto its side, recover smoothly ----
    const capTarget = p.capsized ? 85 * DEG2RAD : 0;
    // tip over fast, right slower (matches the rescue feel)
    const capRate = p.capsized ? 3 : 1.6;
    this.capsizeRoll +=
      (capTarget - this.capsizeRoll) * Math.min(1, capRate * p.dtSec);

    // capsize rolls the entire boat to leeward (sign follows the heel side)
    const capSign = this.heel >= 0 ? -1 : 1;
    this.group.rotation.z = capSign * this.capsizeRoll;
    this.rig.rotation.z = this.heel * (1 - this.capsizeRoll / (90 * DEG2RAD));

    // flag streams downwind (cosmetic); flaps harder when luffing
    const flagWobble = luffing ? Math.sin(p.nowMs / 50) * 0.4 : 0;
    this.flag.rotation.y =
      rot * 0.5 + Math.sin(p.nowMs / 120) * 0.1 + flagWobble;
  }
}

function makeHull(): THREE.Mesh {
  // boat outline in the X(beam)–Y(length) plane, bow at +Y
  const beam = 1.5;
  const shape = new THREE.Shape();
  shape.moveTo(0, 3.4); // bow tip
  shape.bezierCurveTo(beam, 1.8, beam, -1.6, beam * 0.7, -2.6); // starboard
  shape.lineTo(-beam * 0.7, -2.6); // transom (stern)
  shape.bezierCurveTo(-beam, -1.6, -beam, 1.8, 0, 3.4); // port
  const geom = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.25,
    bevelThickness: 0.25,
    depth: 0.9,
    steps: 1,
  });
  // lay flat: shape +Y(length) -> -Z(forward), extrude +Z(height) -> +Y(up)
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, -0.2, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: WOOD,
    flatShading: true,
    roughness: 0.75,
  });
  const hull = new THREE.Mesh(geom, mat);

  // a lighter deck inset on top so it reads as an open dinghy
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.1, 4.2),
    new THREE.MeshStandardMaterial({
      color: DECK,
      flatShading: true,
      roughness: 0.8,
    })
  );
  deck.position.set(0, 0.62, -0.1);
  hull.add(deck);
  // open cockpit floor
  const pit = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.12, 1.9),
    new THREE.MeshStandardMaterial({ color: COCKPIT, roughness: 0.95 })
  );
  pit.position.set(0, 0.66, 0.7);
  hull.add(pit);
  return hull;
}
