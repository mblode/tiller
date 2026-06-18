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
  // A procedural pixel-art ocean: chunky Bayer-dithered blue bands keyed off
  // world coordinates (so it stays world-locked as the boat sails), with slow
  // drifting wave streaks, sparse foam sparkle and an edge depth-gradient.
  const sea = makeSea();
  scene.add(sea.mesh);

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

    // sea follows the boat so the plane always fills the view; the shader keys
    // off world coords, so the pattern stays world-locked (only scrolls as you
    // actually sail — no decorative drift). Freeze the animation under the OS
    // reduced-motion preference, matching the objective ring.
    sea.mesh.position.set(bx, 0, bz);
    sea.material.uniforms.uTime.value = reduceMotion ? 0 : nowMs / 1000;
    sea.material.uniforms.uBoat.value.set(bx, bz);
    sea.material.uniforms.uWind.value = -sim.windDir * DEG2RAD;

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
    canvas.remove();
  };
}

// A procedural pixel-art ocean on a flat plane. Unlit (so the colours stay
// saturated regardless of scene lighting); the pattern is driven by world XZ so
// it stays world-locked while the mesh itself follows the boat.
function makeSea(): {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
} {
  const material = new THREE.ShaderMaterial({
    fog: false,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vWorld;
      uniform float uTime;
      uniform vec2 uBoat;
      uniform float uWind;

      // four-stop blue palette, deep -> light (tuned to the 0x123a5a clear colour)
      const vec3 C0 = vec3(0.055, 0.184, 0.306); // #0e2f4e deep navy
      const vec3 C1 = vec3(0.078, 0.227, 0.353); // #143a5a
      const vec3 C2 = vec3(0.114, 0.314, 0.471); // #1d5078
      const vec3 C3 = vec3(0.184, 0.435, 0.588); // #2f6f96 light crest
      const vec3 FOAM = vec3(0.74, 0.86, 0.93);  // pale foam fleck

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
      }

      // value noise with smooth interpolation
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 3; i++) {
          v += amp * vnoise(p);
          p *= 2.02;
          amp *= 0.5;
        }
        return v;
      }

      // ordered 4x4 Bayer dither threshold in [0,1)
      float bayer(vec2 fragXY) {
        int x = int(mod(fragXY.x, 4.0));
        int y = int(mod(fragXY.y, 4.0));
        int idx = x + y * 4;
        float m[16];
        m[0]=0.0;  m[1]=8.0;  m[2]=2.0;  m[3]=10.0;
        m[4]=12.0; m[5]=4.0;  m[6]=14.0; m[7]=6.0;
        m[8]=3.0;  m[9]=11.0; m[10]=1.0; m[11]=9.0;
        m[12]=15.0;m[13]=7.0; m[14]=13.0;m[15]=5.0;
        float v = 0.0;
        for (int i = 0; i < 16; i++) {
          if (i == idx) { v = m[i]; }
        }
        return (v + 0.5) / 16.0;
      }

      void main() {
        // snap world coords into chunky pixel cells (~0.55 m) so the surface
        // reads as blocks rather than a smooth gradient
        const float CELL = 0.55;
        vec2 cell = floor(vWorld / CELL);
        vec2 wdir = vec2(sin(uWind), cos(uWind));

        // static, world-locked spatial structure (does NOT translate, so there
        // is no whole-field cell-stepping as time passes)
        float base = fbm(cell * 0.16);

        // motion comes from continuous traveling ripples: sin() varies smoothly
        // in time, and the per-cell phase offset (base * 5.0) means neighbouring
        // cells cross brightness thresholds at different moments — so the surface
        // shimmers and flows instead of pulsing in unison.
        float crest = sin(dot(cell, wdir) * 0.55 - uTime * 1.4 + base * 5.0);
        vec2 cross = vec2(-wdir.y, wdir.x);
        float swell = sin(dot(cell, cross) * 0.22 - uTime * 0.55 + base * 3.0);

        float n = 0.5 + (base - 0.5) * 0.7 + crest * 0.16 + swell * 0.08;

        // dither the value before banding for speckled band edges
        float dith = (bayer(gl_FragCoord.xy) - 0.5) * 0.16;
        float t = clamp(n + dith, 0.0, 1.0);

        // hard banding across the 4-stop palette
        vec3 col;
        if (t < 0.32) {
          col = C0;
        } else if (t < 0.55) {
          col = C1;
        } else if (t < 0.80) {
          col = C2;
        } else {
          col = C3;
        }

        // sparse foam flecks that ride the moving crests: a static per-cell
        // eligibility hash gated on crest proximity, so sparkles travel with the
        // ripples (smooth) rather than blinking on a discrete clock.
        float fh = hash21(cell);
        if (fh > 0.95 && crest > 0.93 && t > 0.45) {
          col = FOAM;
        }

        // depth gradient: darken with distance from the boat (replaces fog)
        float d = length(vWorld - uBoat);
        float depth = smoothstep(45.0, 120.0, d);
        col = mix(col, C0 * 0.7, depth * 0.85);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    uniforms: {
      uBoat: { value: new THREE.Vector2(0, 0) },
      uTime: { value: 0 },
      uWind: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE, PLANE), material);
  mesh.rotation.x = -Math.PI / 2;
  return { material, mesh };
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
