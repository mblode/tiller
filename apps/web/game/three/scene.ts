import * as THREE from "three";

import type { GameBridge } from "../bridge";
import { COURSE, DEG2RAD, NO_GO_HALF } from "../constants";
import { BoatModel } from "./boat";
import { buildHarbour } from "./harbour";
import { markFor, Sim } from "./sim";

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

export function createScene(
  container: HTMLElement,
  bridge: GameBridge,
  onReady?: () => void
): () => void {
  const sim = new Sim(bridge);

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

  // --- sea -------------------------------------------------------------------
  const tex = new THREE.TextureLoader().load("sprites/water.png", () =>
    onReady?.()
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

  // --- course marks + start line --------------------------------------------
  const marks = [makeBuoy(), makeBuoy()];
  const wm = markFor("WM");
  const lm = markFor("LM");
  if (wm) {
    marks[0].position.set(w2x(wm.x), 0.3, w2z(wm.y));
  }
  if (lm) {
    marks[1].position.set(w2x(lm.x), 0.3, w2z(lm.y));
  }
  for (const m of marks) {
    scene.add(m);
  }
  const startLine = new THREE.Mesh(
    new THREE.PlaneGeometry(
      Math.abs(COURSE.startBoat.x - COURSE.startPin.x),
      1.2
    ),
    new THREE.MeshStandardMaterial({
      color: 0xff_ff_ff,
      opacity: 0.5,
      transparent: true,
    })
  );
  startLine.rotation.x = -Math.PI / 2;
  startLine.position.set(0, 0.05, w2z(COURSE.startLineY));
  scene.add(startLine);

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

    // wedge sits at the boat, points toward where the wind comes FROM
    wedge.mesh.position.set(bx, 0.06, bz);
    wedge.mesh.rotation.y = -sim.windDir * DEG2RAD;
    wedge.setActive(sim.derived.aTwa < NO_GO_HALF);

    const racing = sim.mode === "race";
    marks[0].visible = racing;
    marks[1].visible = racing;
    startLine.visible = racing;

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
      onReady?.();
    }
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
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
