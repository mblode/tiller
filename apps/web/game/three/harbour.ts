import * as THREE from "three";

import type { Obstacle } from "../types";

// World → Three: a mesh that should sit at world (wx, wy) is placed at three
// (wx, y, -wy), with three +Y = up. 1 three unit = 1 world metre. The harbour
// lives along the EAST edge (world +x) so the open course stays to the west.
//
// Obstacles are returned in WORLD coords ({ x: wx, y: wy, r }); the sim flips z.

// --- limited palette --------------------------------------------------------
const SAND = 0xd9_c0_8a;
const SAND_WET = 0xb8_9d_66; // darker waterline edge
const ROCK = 0x5a_55_50; // dark breakwater rock
const ROCK_DARK = 0x47_43_3f;
const WOOD = 0x8a_6a_3f; // finger docks / planks
const WOOD_DARK = 0x6b_50_2e; // pier wall
const HULL_CREAM = 0xf0_e9_d8;
const HULL_WHITE = 0xf6_f4_ef;
const HULL_BLUE = 0xcf_dd_e6;
const BATHS_WALL = 0xe4_e2_dc;

function mat(color: number, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness,
  });
}

/** A flat-topped box sitting on the water, placed by its world (wx, wy) centre. */
function slab(
  width: number,
  height: number,
  depth: number,
  wx: number,
  wy: number,
  topY: number,
  material: THREE.Material
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material
  );
  mesh.position.set(wx, topY - height / 2, -wy);
  return mesh;
}

export function buildHarbour(): { group: THREE.Group; obstacles: Obstacle[] } {
  const group = new THREE.Group();
  const obstacles: Obstacle[] = [];

  const sandMat = mat(SAND, 0.95);
  const sandWetMat = mat(SAND_WET, 0.92);
  const rockMat = mat(ROCK, 0.9);
  const rockDarkMat = mat(ROCK_DARK, 0.92);
  const woodMat = mat(WOOD, 0.8);
  const woodDarkMat = mat(WOOD_DARK, 0.82);
  const bathsMat = mat(BATHS_WALL, 0.7);
  const hullMats = [
    mat(HULL_CREAM, 0.6),
    mat(HULL_WHITE, 0.55),
    mat(HULL_BLUE, 0.6),
  ];

  // === BEACH ================================================================
  // A long sand landmass along the east shore with an irregular, curved
  // waterline. Built as a flat extruded shape in the world XY plane, then laid
  // onto the ground (world y → three -z). Sand sits a touch above the water.
  const SAND_TOP = 0.35;
  const shore = new THREE.Shape();
  // waterline (west edge), south → north, gently wavy
  const waterline: [number, number][] = [
    [78, -120],
    [72, -90],
    [80, -60],
    [70, -30],
    [76, 0],
    [66, 30],
    [74, 64],
    [70, 100],
    [82, 140],
  ];
  // inland (east edge) closes the shape off-screen
  const inland: [number, number][] = [
    [150, 150],
    [150, -130],
  ];
  shore.moveTo(waterline[0][0], waterline[0][1]);
  for (const [px, py] of waterline.slice(1)) {
    shore.lineTo(px, py);
  }
  for (const [px, py] of inland) {
    shore.lineTo(px, py);
  }
  shore.closePath();

  const beachGeom = new THREE.ExtrudeGeometry(shore, {
    bevelEnabled: false,
    depth: SAND_TOP + 0.4,
  });
  // Extruded along +Z in shape space; rotate so the shape's (x, y) becomes
  // world (x, y) laid flat: shape-x → three +x, shape-y → three -z.
  beachGeom.rotateX(Math.PI / 2);
  const beach = new THREE.Mesh(beachGeom, sandMat);
  beach.position.y = SAND_TOP;
  group.add(beach);

  // wet-sand strip hugging the waterline (slightly lower + darker)
  const wetGeom = new THREE.ExtrudeGeometry(shore, {
    bevelEnabled: false,
    depth: 0.5,
  });
  wetGeom.rotateX(Math.PI / 2);
  const wet = new THREE.Mesh(wetGeom, sandWetMat);
  // shift the wet copy a couple metres seaward (−x) to peek out past the dry sand
  wet.position.set(-3, 0.18, 0);
  group.add(wet);

  // beach obstacles: circles tracing the waterline, growing inland
  for (const [wx, wy] of waterline) {
    obstacles.push({ r: 26, x: wx + 14, y: wy });
  }

  // === MARINA BASIN =========================================================
  // L-shaped dark-rock breakwater on the north + west sides; a wooden pier
  // wall on the east + south; finger docks with rows of moored boats inside.
  const PIER_TOP = 1.3;
  const ROCK_TOP = 1.8;

  // West breakwater arm (runs north–south along x≈36)
  group.add(slab(7, ROCK_TOP + 1.2, 96, 36, 40, ROCK_TOP, rockMat));
  group.add(slab(4, 0.6, 96, 34, 40, ROCK_TOP + 0.5, rockDarkMat)); // crest
  // North breakwater arm (runs east–west along y≈90)
  group.add(slab(44, ROCK_TOP + 1.2, 7, 56, 90, ROCK_TOP, rockMat));
  group.add(slab(44, 0.6, 4, 56, 92, ROCK_TOP + 0.5, rockDarkMat));

  // East pier wall (wooden, along x≈74)
  group.add(slab(5, PIER_TOP + 1, 100, 74, 40, PIER_TOP, woodDarkMat));
  // South pier wall (wooden, along y≈-10)
  group.add(slab(42, PIER_TOP + 1, 5, 55, -10, PIER_TOP, woodDarkMat));

  // breakwater + pier obstacles (overlapping circles tracing the L + walls)
  obstacles.push({ r: 8, x: 36, y: 0 });
  obstacles.push({ r: 8, x: 36, y: 24 });
  obstacles.push({ r: 8, x: 36, y: 48 });
  obstacles.push({ r: 8, x: 36, y: 72 });
  obstacles.push({ r: 8, x: 40, y: 90 });
  obstacles.push({ r: 8, x: 56, y: 90 });
  obstacles.push({ r: 8, x: 72, y: 90 });
  obstacles.push({ r: 7, x: 74, y: 70 });
  obstacles.push({ r: 7, x: 74, y: 40 });
  obstacles.push({ r: 7, x: 74, y: 10 });
  obstacles.push({ r: 7, x: 60, y: -10 });
  obstacles.push({ r: 7, x: 44, y: -10 });

  // --- finger docks + moored boats -----------------------------------------
  // Docks run east–west off a spine near the east pier; boats moored either
  // side. Five fingers stepping north up the basin.
  const fingerYs = [6, 24, 42, 60, 78];
  const FINGER_LEN = 30; // metres (east–west)
  const FINGER_X0 = 44; // west end of each finger
  const DECK_TOP = 0.85;
  for (let f = 0; f < fingerYs.length; f += 1) {
    const fy = fingerYs[f];
    const cx = FINGER_X0 + FINGER_LEN / 2;
    group.add(slab(FINGER_LEN, 0.35, 2.2, cx, fy, DECK_TOP, woodMat));
    obstacles.push({ r: 9, x: cx, y: fy });

    // moored boat hulls in a row along each side of the finger
    const boatsPerRow = 6;
    for (let b = 0; b < boatsPerRow; b += 1) {
      const bx = FINGER_X0 + 3 + b * ((FINGER_LEN - 6) / (boatsPerRow - 1));
      const hullMat = hullMats[(f + b) % hullMats.length];
      // boat on the +y side of the finger
      group.add(makeMooredBoat(bx, fy + 3.4, hullMat));
      // boat on the −y side of the finger
      group.add(makeMooredBoat(bx, fy - 3.4, hullMat));
    }
  }

  // === BATHS ================================================================
  // A small square enclosure (thin pale walls, open centre) to the south.
  const BATHS_CX = 55;
  const BATHS_CY = -70;
  const BATHS_SIZE = 30;
  const BATHS_TOP = 1.1;
  const wallT = 2.2;
  const half = BATHS_SIZE / 2;
  // north + south walls
  group.add(
    slab(
      BATHS_SIZE,
      BATHS_TOP + 0.8,
      wallT,
      BATHS_CX,
      BATHS_CY + half,
      BATHS_TOP,
      bathsMat
    )
  );
  group.add(
    slab(
      BATHS_SIZE,
      BATHS_TOP + 0.8,
      wallT,
      BATHS_CX,
      BATHS_CY - half,
      BATHS_TOP,
      bathsMat
    )
  );
  // east + west walls
  group.add(
    slab(
      wallT,
      BATHS_TOP + 0.8,
      BATHS_SIZE,
      BATHS_CX + half,
      BATHS_CY,
      BATHS_TOP,
      bathsMat
    )
  );
  group.add(
    slab(
      wallT,
      BATHS_TOP + 0.8,
      BATHS_SIZE,
      BATHS_CX - half,
      BATHS_CY,
      BATHS_TOP,
      bathsMat
    )
  );

  // baths obstacles (trace the square walls so the boat can't cut through)
  obstacles.push({ r: 8, x: BATHS_CX, y: BATHS_CY + half });
  obstacles.push({ r: 8, x: BATHS_CX, y: BATHS_CY - half });
  obstacles.push({ r: 8, x: BATHS_CX + half, y: BATHS_CY });
  obstacles.push({ r: 8, x: BATHS_CX - half, y: BATHS_CY });

  // === JETTY ================================================================
  // A long thin plank strip linking the marina/baths area across to the beach
  // shore. Runs east–west; sits just above the water on slim piles.
  const JETTY_Y = -32;
  const JETTY_X0 = 60; // near the basin's south-east
  const JETTY_X1 = 96; // into the beach
  const jettyCx = (JETTY_X0 + JETTY_X1) / 2;
  const jettyLen = JETTY_X1 - JETTY_X0;
  group.add(slab(jettyLen, 0.3, 3, jettyCx, JETTY_Y, 0.7, woodMat));
  // a couple of support piles for a little depth
  for (let i = 0; i <= 3; i += 1) {
    const px = JETTY_X0 + (i * jettyLen) / 3;
    group.add(slab(1, 1, 1, px, JETTY_Y + 1.4, 0.6, woodDarkMat));
    group.add(slab(1, 1, 1, px, JETTY_Y - 1.4, 0.6, woodDarkMat));
  }
  // jetty obstacles
  for (let i = 0; i <= 4; i += 1) {
    const px = JETTY_X0 + (i * jettyLen) / 4;
    obstacles.push({ r: 5, x: px, y: JETTY_Y });
  }

  return { group, obstacles };
}

/**
 * A tiny moored yacht: a low hull wedge with a stub cabin, placed by its world
 * (wx, wy) centre. Bows point roughly toward the dock (no heading needed for
 * scenery, so they all face the same way — reads fine at this scale).
 */
function makeMooredBoat(
  wx: number,
  wy: number,
  hullMat: THREE.MeshStandardMaterial
): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.1, 2.2), hullMat);
  hull.position.y = 0.9;
  g.add(hull);
  // pointed bow: a small wedge on the +x end
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 4), hullMat);
  bow.rotation.z = -Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(3.4, 0.9, 0);
  g.add(bow);
  // stub cabin
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.9, 1.4),
    new THREE.MeshStandardMaterial({
      color: 0xdc_d6_c6,
      flatShading: true,
      roughness: 0.6,
    })
  );
  cabin.position.set(-0.5, 1.7, 0);
  g.add(cabin);
  g.position.set(wx, 0, -wy);
  return g;
}
