import * as THREE from "three";

import type { GameBridge } from "../bridge";
import { DEG2RAD, NO_GO_HALF, RESCUE_SPAWNS } from "../constants";
import type { Objective } from "../levels";
import { BoatModel } from "./boat";
import { buildHarbour } from "./harbour";
import { Sim } from "./sim";

// World → Three: world metres (x east, y north, +Y up) map to the ground plane
// (x, 0, -y). Heading 0 (north) = -Z. 1 world metre = 1 Three unit.
const VIEW_M = 48; // metres visible vertically (the "zoom")
const PIXEL = 3; // pixelation factor (low-res buffer, CSS upscales)
const TILE_M = 14; // metres of sea per water-texture tile
const PLANE = 260;

function w2x(x: number) {
  return x;
}
function w2z(y: number) {
  return -y;
}

/** Dispose every geometry + material under an object (course markers, scene). */
function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const mat = o.material;
      if (Array.isArray(mat)) {
        for (const x of mat) {
          x.dispose();
        }
      } else {
        mat.dispose();
      }
    }
  });
}

export function createScene(
  container: HTMLElement,
  bridge: GameBridge,
  onReady?: () => void
): () => void {
  const sim = new Sim(bridge);

  // Respect the OS reduced-motion preference: the active-objective ring sits at a
  // steady opacity instead of pulsing.
  const reduceMotion =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false });
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x12_3a_5a, 1);
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.imageRendering = "pixelated";
  container.append(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16_42_64);
  scene.fog = new THREE.Fog(0x16_42_64, VIEW_M * 1.6, VIEW_M * 3.6);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  // 3/4 isometric: above and to the south, looking down ~55° at the boat.
  const camOffset = new THREE.Vector3(
    0,
    Math.sin(55 * DEG2RAD),
    Math.cos(55 * DEG2RAD)
  ).multiplyScalar(120);

  scene.add(new THREE.HemisphereLight(0xe6_f4_ff, 0x1d_46_68, 2.6));
  scene.add(new THREE.AmbientLight(0xff_ff_ff, 0.6));
  const sun = new THREE.DirectionalLight(0xff_f4_da, 2.6);
  sun.position.set(-0.5, 1.2, 0.45);
  scene.add(sun);

  // onReady can be reached two ways (texture load and first rendered frame);
  // fire it at most once so the consumer's boot flag flips a single time.
  let readyNotified = false;
  const notifyReady = () => {
    if (!readyNotified) {
      readyNotified = true;
      onReady?.();
    }
  };

  // --- sea -------------------------------------------------------------------
  const tex = new THREE.TextureLoader().load("sprites/water.png", () =>
    notifyReady()
  );
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.repeat.set(PLANE / TILE_M, PLANE / TILE_M);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(PLANE, PLANE),
    new THREE.MeshStandardMaterial({ map: tex, metalness: 0, roughness: 0.95 })
  );
  sea.rotation.x = -Math.PI / 2;
  scene.add(sea);

  // --- Brighton harbour: beach, breakwater, marina, baths (scenery + obstacles)
  const harbour = buildHarbour();
  scene.add(harbour.group);
  sim.setObstacles(harbour.obstacles);

  // --- no-go wedge -----------------------------------------------------------
  const wedge = makeWedge();
  scene.add(wedge.mesh);

  // --- course objectives (rebuilt whenever the level changes) ----------------
  const courseGroup = new THREE.Group();
  scene.add(courseGroup);
  interface Marker {
    group: THREE.Group;
    ring: THREE.Mesh;
  }
  let markers: Marker[] = [];
  let renderedLevelId = -1;

  const buildCourse = () => {
    for (const m of markers) {
      courseGroup.remove(m.group);
      disposeTree(m.group);
    }
    markers = sim.level.objectives.map((obj: Objective) => {
      const group = new THREE.Group();
      group.position.set(w2x(obj.x), 0, w2z(obj.y));
      const buoy = obj.kind === "finish" ? makeFinishBuoy() : makeBuoy();
      buoy.position.y = 0.3;
      group.add(buoy);
      const ring = makeTargetRing(obj.r);
      group.add(ring);
      courseGroup.add(group);
      return { group, ring };
    });
    renderedLevelId = sim.level.id;
  };
  buildCourse();

  // --- wake (recycled foam dabs) --------------------------------------------
  const wake = makeWake(scene);

  // --- boat ------------------------------------------------------------------
  const boat = new BoatModel();
  scene.add(boat.group);

  // person-overboard marker (a head bobbing in the water + a life-ring)
  const mob = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 8, 6),
    new THREE.MeshStandardMaterial({
      color: 0xff_5a_3c,
      flatShading: true,
      roughness: 0.7,
    })
  );
  mob.visible = false;
  scene.add(mob);

  // drowned-passenger rescue objectives — a fixed pool of swimmers, toggled per
  // level (most levels have none; the final race uses all of them).
  const swimmers = RESCUE_SPAWNS.map(() => {
    const s = makeSwimmer();
    s.visible = false;
    scene.add(s);
    return s;
  });

  // --- loop ------------------------------------------------------------------
  let raf = 0;
  let last = 0;
  let started = false;
  let firstFrame = true;

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(
      Math.max(1, Math.floor(w / PIXEL)),
      Math.max(1, Math.floor(h / PIXEL)),
      false
    );
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const aspect = w / h;
    camera.left = (-VIEW_M / 2) * aspect;
    camera.right = (VIEW_M / 2) * aspect;
    camera.top = VIEW_M / 2;
    camera.bottom = -VIEW_M / 2;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  const tmp = new THREE.Vector3();
  const frame = (nowMs: number) => {
    raf = requestAnimationFrame(frame);
    if (!started) {
      last = nowMs;
      started = true;
    }
    const dt = Math.min(0.05, (nowMs - last) / 1000);
    last = nowMs;

    sim.update(dt, nowMs);

    const b = sim.boat;
    const bx = w2x(b.x);
    const bz = w2z(b.y);

    boat.group.position.set(bx, 0, bz);
    boat.update({
      capsized: sim.capsized,
      crewSide: sim.crewSide,
      dtSec: dt,
      heading: b.heading,
      heel: sim.heel,
      hiking: bridge.input.hike,
      luff: sim.derived.luff,
      nowMs,
      sailState: b.state,
      sheet: sim.derived.sheet,
      tack: sim.derived.tack,
    });

    // person-overboard marker bobbing in the water
    mob.visible = sim.mob !== null;
    if (sim.mob) {
      mob.position.set(
        w2x(sim.mob.x),
        0.4 + Math.sin(nowMs / 250) * 0.15,
        w2z(sim.mob.y)
      );
    }

    // sea follows the boat; texture offset keeps it world-locked (only scrolls
    // as you actually sail — no decorative drift).
    sea.position.set(bx, 0, bz);
    tex.offset.set(bx / TILE_M, -bz / TILE_M);

    // rebuild course markers when the level changes, then highlight the next one
    if (sim.level.id !== renderedLevelId) {
      buildCourse();
    }
    for (let i = 0; i < markers.length; i += 1) {
      const m = markers[i];
      const done = i < sim.targetIdx;
      const isCurrent = i === sim.targetIdx;
      m.group.visible = !done;
      const ringMat = m.ring.material as THREE.MeshBasicMaterial;
      let activeOpacity = 0.5;
      if (!reduceMotion) {
        activeOpacity = 0.4 + Math.sin(nowMs / 240) * 0.22;
      }
      ringMat.opacity = isCurrent ? activeOpacity : 0.12;
    }

    // wedge sits at the boat, points toward where the wind comes FROM; hidden on
    // early levels where the no-go zone hasn't been taught yet.
    wedge.mesh.visible = sim.level.assists.showWedge;
    wedge.mesh.position.set(bx, 0.06, bz);
    wedge.mesh.rotation.y = -sim.windDir * DEG2RAD;
    wedge.setActive(sim.derived.aTwa < NO_GO_HALF);

    // drowned-passenger swimmers bobbing in the water (hidden once picked up)
    for (let i = 0; i < swimmers.length; i += 1) {
      const r = sim.rescues[i];
      const show = r !== undefined && !r.picked;
      swimmers[i].visible = show;
      if (show) {
        swimmers[i].position.set(
          w2x(r.x),
          0.4 + Math.sin(nowMs / 250 + i) * 0.15,
          w2z(r.y)
        );
      }
    }

    wake.update(
      bx,
      bz,
      b.heading,
      b.speedKt,
      sim.running && !sim.result,
      nowMs
    );

    // camera follow + crash shake
    camera.position.copy(boat.group.position).add(camOffset);
    if (nowMs < sim.shakeUntil) {
      camera.position.x += Math.sin(nowMs * 1.3) * 0.6;
      camera.position.z += Math.cos(nowMs * 1.7) * 0.6;
    }
    tmp.set(bx, 0, bz);
    camera.lookAt(tmp);

    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      notifyReady();
    }
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    // free every geometry + material in the scene (markers, wedge, swimmers,
    // wake, sea, harbour, boat), then the renderer/texture/canvas.
    disposeTree(scene);
    renderer.dispose();
    tex.dispose();
    canvas.remove();
  };
}

function makeWedge() {
  const r = 34;
  const half = NO_GO_HALF * DEG2RAD;
  const seg = 12;
  const pts: number[] = [0, 0];
  for (let i = 0; i <= seg; i += 1) {
    // fan pointing toward -Z (north / bearing 0)
    const a = -half + (2 * half * i) / seg;
    pts.push(Math.sin(a) * r, -Math.cos(a) * r);
  }
  const shape = new THREE.Shape();
  shape.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) {
    shape.lineTo(pts[i], pts[i + 1]);
  }
  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI / 2); // lay flat on the water (XZ)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff_3b_30,
    depthWrite: false,
    opacity: 0.12,
    transparent: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  return {
    mesh,
    setActive: (active: boolean) => {
      mat.opacity = active ? 0.3 : 0.12;
    },
  };
}

// A person in the water: an orange head ringed by a white-and-red life buoy.
function makeSwimmer(): THREE.Group {
  const g = new THREE.Group();
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 8, 6),
    new THREE.MeshStandardMaterial({
      color: 0xff_d2_8a,
      flatShading: true,
      roughness: 0.7,
    })
  );
  head.position.y = 0.2;
  g.add(head);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.22, 6, 14),
    new THREE.MeshStandardMaterial({
      color: 0xff_5a_3c,
      flatShading: true,
      roughness: 0.6,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  return g;
}

function makeBuoy(): THREE.Mesh {
  const geom = new THREE.SphereGeometry(1.1, 12, 10);
  geom.scale(1, 1.2, 1);
  const buoy = new THREE.Mesh(
    geom,
    new THREE.MeshStandardMaterial({
      color: 0xff_6a_1a,
      flatShading: true,
      roughness: 0.7,
    })
  );
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(1.12, 1.12, 0.4, 12),
    new THREE.MeshStandardMaterial({ color: 0xc4_3e_0a, roughness: 0.8 })
  );
  band.position.y = 0.5;
  buoy.add(band);
  return buoy;
}

// The final objective gets a tall white-and-black finish buoy.
function makeFinishBuoy(): THREE.Mesh {
  const geom = new THREE.SphereGeometry(1.1, 12, 10);
  geom.scale(1, 1.5, 1);
  const buoy = new THREE.Mesh(
    geom,
    new THREE.MeshStandardMaterial({
      color: 0xf4_f7_ff,
      flatShading: true,
      roughness: 0.6,
    })
  );
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(1.14, 1.14, 0.45, 12),
    new THREE.MeshStandardMaterial({ color: 0x16_1a_22, roughness: 0.8 })
  );
  band.position.y = 0.55;
  buoy.add(band);
  return buoy;
}

// A flat glowing ring on the water marking the radius you must sail into. The
// active objective's ring pulses (set in the frame loop).
function makeTargetRing(r: number): THREE.Mesh {
  const geom = new THREE.RingGeometry(Math.max(0.6, r - 0.8), r, 28);
  geom.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({
      color: 0x7a_d8_ff,
      depthWrite: false,
      opacity: 0.3,
      side: THREE.DoubleSide,
      transparent: true,
    })
  );
  mesh.position.y = 0.06;
  return mesh;
}

function makeWake(scene: THREE.Scene) {
  const POOL = 48;
  const LIFE = 1300;
  const SPAWN = 45;
  const STERN = 2.4;
  const dabs: {
    mesh: THREE.Mesh;
    mat: THREE.MeshBasicMaterial;
    born: number;
  }[] = [];
  for (let i = 0; i < POOL; i += 1) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff_ff_ff,
      depthWrite: false,
      opacity: 0,
      transparent: true,
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 10), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    dabs.push({ born: -1e9, mat, mesh });
  }
  let cursor = 0;
  let lastSpawn = 0;
  return {
    update(
      bx: number,
      bz: number,
      heading: number,
      speedKt: number,
      alive: boolean,
      now: number
    ) {
      if (alive && speedKt > 1 && now - lastSpawn > SPAWN) {
        lastSpawn = now;
        const r = heading * DEG2RAD;
        const jitter = (Math.random() - 0.5) * 1.4;
        const d = dabs[cursor];
        cursor = (cursor + 1) % POOL;
        // stern is behind the bow (-forward). forward in world = (sin r, cos r) -> Three (sin r, -cos r)
        d.mesh.position.set(
          bx - Math.sin(r) * STERN + Math.cos(r) * jitter,
          0.04,
          bz + Math.cos(r) * STERN + Math.sin(r) * jitter
        );
        d.born = now;
        d.mesh.visible = true;
      }
      for (const d of dabs) {
        const age = (now - d.born) / LIFE;
        if (age >= 1) {
          d.mesh.visible = false;
          continue;
        }
        d.mat.opacity = (1 - age) * 0.5;
        const s = 0.5 + age * 3.2;
        d.mesh.scale.set(s, s, s);
      }
    },
  };
}
