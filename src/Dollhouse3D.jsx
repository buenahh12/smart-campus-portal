import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { BUILDING_NAME, FLOORS, METERS_PER_UNIT as M, PLAN_HEIGHT, PLAN_WIDTH } from "./floorPlans";
import { STAIR, buildExterior, buildRoute, stairFrame } from "./building3d";
import { concreteTexture, courtRailing, courtyard, furnishFloor, hexTexture, scaleUv, tileTexture, woodTexture } from "./interior3d";

// 3D dollhouse of the Main Academic Building, built from the same rectangles as the 2D
// floor plan. The building method (floor slabs, 2.5 m walls with door gaps, stacked floors)
// follows SSCAFourFloorBuilder.cs from the SSCA NAVI AR app by Jan Lawrence Cambaya Florido.
// Floors above the chosen one are hidden and floors below are faded, like lifting the roof off.

const FLOOR_HEIGHT = 3.5;
const WALL_HEIGHT = 2.5;
const WALL_THICKNESS = 0.15;
const SLAB = 0.2;
const DOOR_WIDTH = 1.0;

// Like an architect's model: white walls, wood floors in rooms, light tiles in hallways and C.R.s.
const COLORS = {
  hall: "#ebe4d3",
  wall: "#9bd35c", // lime green walls inside, as in the photos
  base: "#3f8f3a", // darker green strip along the bottom of the walls
  door: "#f3f2ec",
  bars: "#24372c",
  column: "#4fae3e",
  edge: "#5f8a4a",
  stairs: "#a9a8a2", // grey concrete stairs
  exit: "#e9a99f",
  deck: "#d7e0d1",
  room: { classroom: "#fbf8f1", office: "#e2ebdb", lab: "#dfe8ef", facility: "#f3e6d4", cr: "#e7e4ee" },
};

const roomColor = (item) => COLORS[item.type] || COLORS.room[item.type] || COLORS.room.classroom;

// Plan (x right, y down) to world (x right, z toward the viewer), centred on the building.
const toWorld = (x, y) => [(x - PLAN_WIDTH / 2) * M, (y - PLAN_HEIGHT / 2) * M];

function buildFloor(plan, materialFor) {
  const group = new THREE.Group();
  const box = (width, height, depth, color, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materialFor(color));
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  // A thin bar from a to b (handrails).
  const bar = (a, b, color, thickness = 0.05) => {
    const length = a.distanceTo(b);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(thickness, thickness, length, 8), materialFor(color));
    mesh.position.copy(a).lerp(b, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    group.add(mesh);
  };
  const slab = ([x, y, w, h], color, lift = 0, texture = "") => {
    const [cx, cz] = toWorld(x + w / 2, y + h / 2);
    if (!texture) {
      box(w * M, SLAB, h * M, color, cx, SLAB / 2 + lift, cz);
      return;
    }
    const mesh = new THREE.Mesh(scaleUv(new THREE.BoxGeometry(w * M, SLAB, h * M), w * M, h * M), materialFor("#ffffff", false, texture));
    mesh.position.set(cx, SLAB / 2 + lift, cz);
    group.add(mesh);
  };
  const floorTexture = (item) => (item.type === "cr" ? "crtile" : ["classroom", "office", "lab", "facility"].includes(item.type) ? "wood" : "");

  plan.halls.forEach((hall) => slab(hall.rect, COLORS.hall, 0, "concrete"));
  // Every wall line on this floor, merged, so a wall two rooms share is drawn once.
  const lines = new Map(); // "h|y" or "v|x" -> { spans: [[from, to]], gaps: [[from, to]] }
  const lineOf = (horizontal, at) => {
    const key = `${horizontal ? "h" : "v"}|${at.toFixed(2)}`;
    if (!lines.has(key)) lines.set(key, { horizontal, at, spans: [], gaps: [] });
    return lines.get(key);
  };
  const doorGap = DOOR_WIDTH / M / 2;
  plan.rooms.forEach((item) => {
    if (item.type === "void") {
      if (plan.level === 1) {
        // The courtyard: hexagon pavers, plants, umbrellas and the fountain.
        slab(item.rect, "#ffffff", 0, "hex");
        group.add(courtyard(item.rect, toWorld, M, materialFor, SLAB));
      } else {
        group.add(courtRailing(item.rect, toWorld, M, materialFor, SLAB, COLORS));
      }
      return;
    }
    const fromBelow = item.type === "stairs" && FLOORS.find((other) => other.building === plan.building && other.level === plan.level - 1)?.rooms.some((room) => room.stair && room.stair === item.stair);
    if (!fromBelow) slab(item.rect, roomColor(item), 0.01, floorTexture(item));
    if (item.type === "deck") return;
    if (item.type === "stairs") {
      // A real staircase up to the floor above (if the same stairs continue there): for U-shaped
      // stairs, a flight out to the half landing at the far end and a flight back; otherwise one
      // straight flight. Each step is a solid block, like a concrete stair.
      const above = FLOORS.find((other) => other.building === plan.building && other.level === plan.level + 1)?.rooms.some((room) => room.stair && room.stair === item.stair);
      if (above) {
        const frame = stairFrame(item);
        const STEPS = 10;
        const half = FLOOR_HEIGHT / 2;
        const step = (t0, t1, u0, u1, top) => {
          const [ax, az] = toWorld(...frame.at(t0, u0));
          const [bx, bz] = toWorld(...frame.at(t1, u1));
          box(Math.abs(bx - ax), top, Math.abs(bz - az), COLORS.stairs, (ax + bx) / 2, SLAB + top / 2, (az + bz) / 2);
        };
        const span = STAIR.LANDING - STAIR.FIRST;
        if (item.shape === "u") {
          for (let i = 0; i < STEPS; i += 1) {
            step(STAIR.FIRST + (span * i) / STEPS, STAIR.FIRST + (span * (i + 1)) / STEPS, 0.04, 0.49, (half * (i + 1)) / STEPS);
            step(STAIR.LANDING - (span * (i + 1)) / STEPS, STAIR.LANDING - (span * i) / STEPS, 0.51, 0.96, half + (half * (i + 1)) / STEPS - SLAB);
          }
          step(STAIR.LANDING, 0.98, 0.04, 0.96, half);
          // The wall between the two flights, and a dark metal handrail on each flight.
          const [ax, az] = toWorld(...frame.at(STAIR.FIRST, 0.5));
          const [bx, bz] = toWorld(...frame.at(STAIR.LANDING, 0.5));
          box(frame.vertical ? 0.12 : Math.abs(bx - ax), FLOOR_HEIGHT - 0.4, frame.vertical ? Math.abs(bz - az) : 0.12, COLORS.wall, (ax + bx) / 2, SLAB + (FLOOR_HEIGHT - 0.4) / 2, (az + bz) / 2);
          const railAt = (t, u, height) => {
            const [px, pz] = toWorld(...frame.at(t, u));
            return new THREE.Vector3(px, SLAB + height + 0.9, pz);
          };
          bar(railAt(STAIR.FIRST, 0.44, 0.15), railAt(STAIR.LANDING, 0.44, half), COLORS.bars);
          bar(railAt(STAIR.LANDING, 0.56, half), railAt(STAIR.FIRST, 0.56, FLOOR_HEIGHT - 0.2), COLORS.bars);
        } else {
          for (let i = 0; i < STEPS * 2; i += 1) step(STAIR.FIRST + ((0.88 - STAIR.FIRST) * i) / (STEPS * 2), STAIR.FIRST + ((0.88 - STAIR.FIRST) * (i + 1)) / (STEPS * 2), 0.08, 0.92, (FLOOR_HEIGHT * (i + 1)) / (STEPS * 2) - SLAB / 2);
        }
      }
    }
    // This room's four edges; its door (or, for stairs, the whole entrance side) is an opening.
    const [x, y, w, h] = item.rect;
    const edges = [[true, y, x, x + w], [true, y + h, x, x + w], [false, x, y, y + h], [false, x + w, y, y + h]];
    const doors = [item.door, ...(item.extraDoors || [])].filter(Boolean);
    edges.forEach(([horizontal, at, from, to]) => {
      const line = lineOf(horizontal, at);
      line.spans.push([from, to]);
      doors.forEach(([dx, dy]) => {
        const on = horizontal ? Math.abs(dy - at) < 0.6 && dx >= from && dx <= to : Math.abs(dx - at) < 0.6 && dy >= from && dy <= to;
        if (!on) return;
        if (item.type === "stairs") line.gaps.push([from, to]);
        else { const c = horizontal ? dx : dy; line.gaps.push([c - doorGap, c + doorGap]); }
      });
    });
  });
  // Draw each wall line once: merge its spans, cut out the doors, add a dark green base strip
  // and a white door frame over each doorway.
  lines.forEach(({ horizontal, at, spans, gaps }) => {
    spans.sort((p, q) => p[0] - q[0]);
    const merged = [];
    spans.forEach(([from, to]) => {
      const last = merged[merged.length - 1];
      if (last && from <= last[1] + 0.01) last[1] = Math.max(last[1], to);
      else merged.push([from, to]);
    });
    gaps.sort((p, q) => p[0] - q[0]);
    const pieces = [];
    merged.forEach(([from, to]) => {
      let start = from;
      gaps.forEach(([g0, g1]) => {
        if (g1 <= start || g0 >= to) return;
        if (g0 > start) pieces.push([start, g0]);
        start = Math.max(start, g1);
      });
      if (start < to) pieces.push([start, to]);
    });
    const draw = (from, to, height, bottom, color, thickness) => {
      const [ax, az] = horizontal ? toWorld(from, at) : toWorld(at, from);
      const [bx, bz] = horizontal ? toWorld(to, at) : toWorld(at, to);
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 0.05) return;
      box(horizontal ? length : thickness, height, horizontal ? thickness : length, color, (ax + bx) / 2, SLAB + bottom + height / 2, (az + bz) / 2);
    };
    pieces.forEach(([from, to]) => {
      draw(from, to, WALL_HEIGHT, 0, COLORS.wall, WALL_THICKNESS);
      draw(from, to, 0.22, 0, COLORS.base, WALL_THICKNESS + 0.04);
    });
    gaps.forEach(([g0, g1]) => {
      if ((g1 - g0) * M > 1.6) return; // open stair entrances have no frame
      draw(g0, g1, 0.3, WALL_HEIGHT - 0.3, COLORS.door, WALL_THICKNESS + 0.02);
    });
  });
  group.add(furnishFloor(plan, toWorld, M, materialFor, SLAB));
  group.position.y = (plan.floor - 1) * FLOOR_HEIGHT;
  return group;
}

// highlight: a place key ("3:room-304") to light up with a glowing box and a bouncing pin.
// view: "inside" (the floors, like lifting the roof off) or "outside" (the real building).
// route: a findRoute() result; a glowing ball walks it, climbing the stairs, and the camera follows.
const BALL_SPEED = 4.5; // metres a second
const END_PAUSE = 1.6; // seconds at the destination before it starts again

// zoom: allow zooming (pinch, mouse wheel, and + / - buttons).
// pov: while a route shows, the camera walks behind the pin at eye level (first-person view).
export default function Dollhouse3D({ floor, onOpen, label, fallback, highlight = null, view = "inside", route = null, className = "", openLabel = "Open plan", zoom = false, pov = false }) {
  const holder = useRef(null);
  const scene = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = holder.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    element.appendChild(renderer.domElement);

    const world = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 400);
    camera.position.set(0, 66, 82); // far enough that the whole 64 m building fits while it turns

    world.add(new THREE.HemisphereLight("#ffffff", "#c9c2b0", 2.2));
    const sun = new THREE.DirectionalLight("#ffffff", 1.6);
    sun.position.set(-30, 60, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 200 });
    sun.shadow.radius = 6;
    sun.shadow.bias = -0.0008;
    world.add(sun);
    world.add(new THREE.AmbientLight("#fff1e2", 0.35));

    // Each floor gets its own materials so lower floors can be faded independently.
    // Only the main building: floors added there stack on top; other buildings are not drawn.
    const floors = FLOORS.filter((plan) => plan.building === BUILDING_NAME).map((plan) => {
      const materials = new Map();
      const TEXTURES = { wood: woodTexture, tile: () => tileTexture(), crtile: () => tileTexture("#dfe9ee"), concrete: concreteTexture, hex: hexTexture };
      const materialFor = (color, line = false, texture = "") => {
        const key = `${color}${line}${texture}`;
        if (!materials.has(key)) {
          const made = line
            ? new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 })
            : new THREE.MeshLambertMaterial({ color, transparent: true, ...(texture ? { map: TEXTURES[texture]() } : {}) });
          made.userData.wall = color === COLORS.wall; // see-through in Walk view, so walls never hide the pin
          materials.set(key, made);
        }
        return materials.get(key);
      };
      const group = buildFloor(plan, materialFor);
      world.add(group);
      return { floor: plan.floor, group, materials: [...materials.values()] };
    });

    const exterior = buildExterior();
    exterior.visible = false;
    world.add(exterior);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = zoom;
    controls.minDistance = 18;
    controls.maxDistance = 170;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.2;
    controls.autoRotate = !reduceMotion;
    controls.autoRotateSpeed = 0.6;
    // One finger keeps scrolling the page on phones; two fingers turn the model.
    controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
    renderer.domElement.style.touchAction = "pan-y";
    controls.addEventListener("start", () => { controls.autoRotate = false; });

    const resize = () => {
      const { clientWidth: width, clientHeight: height } = element;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(element);
    resize();

    // Only animate while the card is on screen.
    let running = false;
    const loop = (time = 0) => {
      const marker = scene.current?.marker;
      if (marker && !reduceMotion) marker.userData.pin.position.y = marker.userData.pinY + Math.sin(time / 280) * 0.6;
      const walk = scene.current?.walk;
      if (walk && scene.current.view === "inside") stepWalk(walk, time);
      if (walk && scene.current.pov && scene.current.view === "inside") {
        renderer.render(world, camera);
        return;
      }
      controls.update();
      renderer.render(world, camera);
    };
    // Moves the ball along the route, shows its floor clearly (the other route floors faintly),
    // and lets the camera drift after it.
    const stepWalk = (walk, time) => {
      const { curve, length, ball, halo, floors: routeFloors, ballHeight } = walk.group.userData;
      if (walk.started === undefined) walk.started = time;
      // The ball always walks the route (it is the directions, not decoration); with reduced motion
      // only the camera stays still and the glow does not pulse.
      const travelled = ((time - walk.started) / 1000 * BALL_SPEED) % (length + END_PAUSE * BALL_SPEED);
      const point = curve.getPointAt(Math.min(1, travelled / length));
      ball.position.copy(point);
      if (!reduceMotion) {
        halo.scale.setScalar(1 + Math.sin(time / 220) * 0.12);
        ball.position.y += Math.abs(Math.sin(time / 180)) * 0.45;
      }
      const pov = scene.current.pov;
      const level = Math.min(Math.max(...routeFloors), Math.max(1, Math.floor((point.y - ballHeight) / FLOOR_HEIGHT + 0.5) + 1));
      if (level !== walk.level || pov !== walk.pov) {
        walk.level = level;
        walk.pov = pov;
        const top = Math.max(...routeFloors);
        floors.forEach((item) => {
          // POV: only the floor you are on (and the one below, seen down the stairs); overview: the route's floors.
          item.group.visible = pov ? item.floor <= level && item.floor >= level - 1 : item.floor <= top;
          const opacity = item.floor === level ? 1 : pov ? 0.35 : routeFloors.includes(item.floor) ? 0.22 : 0.1;
          item.materials.forEach((material) => {
            const wall = pov && item.floor === level && material.userData.wall;
            material.opacity = material.isLineBasicMaterial ? opacity * 0.55 : wall ? 0.28 : opacity;
            material.depthWrite = item.floor === level && !wall;
          });
        });
      }
      ball.scale.setScalar(pov ? 0.38 : 0.7);
      if (pov) {
        // Eye level, a few steps behind the pin, looking where it is going. Up and down the stairs
        // the camera climbs with it.
        const ahead = curve.getPointAt(Math.min(1, (travelled + 5) / length));
        const behind = curve.getPointAt(Math.max(0, (travelled - 5) / length));
        const heading = ahead.clone().sub(behind).setY(0);
        if (heading.lengthSq() < 0.01) heading.copy(walk.heading || new THREE.Vector3(0, 0, -1));
        heading.normalize();
        walk.heading = walk.heading ? walk.heading.lerp(heading, reduceMotion ? 1 : 0.08).normalize() : heading;
        const eye = point.clone().addScaledVector(walk.heading, -8.5);
        eye.y = point.y - ballHeight + 3.8;
        camera.position.lerp(eye, reduceMotion ? 1 : 0.15);
        const look = point.clone().addScaledVector(walk.heading, 6);
        look.y = ahead.y - ballHeight + 0.6;
        walk.look = walk.look ? walk.look.lerp(look, reduceMotion ? 1 : 0.15) : look;
        camera.lookAt(walk.look);
        return;
      }
      const aim = new THREE.Vector3(point.x * 0.6, point.y - ballHeight, point.z * 0.6);
      const move = aim.sub(controls.target).multiplyScalar(reduceMotion ? 0 : 0.05);
      controls.target.add(move);
      camera.position.add(move);
    };
    const visibility = new IntersectionObserver(([entry]) => {
      running = entry.isIntersecting;
      renderer.setAnimationLoop(running ? loop : null);
    });
    visibility.observe(element);

    scene.current = { floors, controls, camera, world, exterior, marker: null, walk: null, view: "inside", pov: false, floor: null, render: () => !running && loop() };
    return () => {
      visibility.disconnect();
      sizeObserver.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      world.traverse((item) => { item.geometry?.dispose(); if (item.userData.ownMaterial) item.material.dispose(); });
      floors.forEach(({ materials }) => materials.forEach((material) => material.dispose()));
      exterior.userData.materials.forEach((material) => { material.map?.dispose(); material.dispose(); });
      renderer.dispose();
      renderer.domElement.remove();
      scene.current = null;
    };
  }, []);

  // The highlighted room: a translucent green box over it and a pin bobbing above.
  useEffect(() => {
    const current = scene.current;
    if (!current) return undefined;
    const [floorText, id] = String(highlight || "").split(":");
    const plan = FLOORS.find((item) => item.floor === Number(floorText) && item.building === BUILDING_NAME);
    const room = plan?.rooms.find((item) => item.id === id);
    if (!room) return undefined;
    const [x, y, w, h] = room.rect;
    const [cx, cz] = toWorld(x + w / 2, y + h / 2);
    const base = (plan.floor - 1) * FLOOR_HEIGHT;
    const glowMaterial = new THREE.MeshBasicMaterial({ color: "#2ddf87", transparent: true, opacity: 0.38, depthWrite: false });
    const pinMaterial = new THREE.MeshLambertMaterial({ color: "#13a35c" });
    const marker = new THREE.Group();
    const glow = new THREE.Mesh(new THREE.BoxGeometry(w * M, WALL_HEIGHT, h * M), glowMaterial);
    glow.position.set(cx, base + SLAB + WALL_HEIGHT / 2, cz);
    const pin = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), pinMaterial);
    head.position.y = 1.6;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.9, 24), pinMaterial);
    tip.rotation.x = Math.PI;
    tip.position.y = 0.45;
    pin.add(head, tip);
    pin.position.set(cx, base + WALL_HEIGHT + 1.2, cz);
    [glow, head, tip].forEach((mesh) => { mesh.userData.ownMaterial = true; });
    marker.add(glow, pin);
    marker.userData = { pin, pinY: pin.position.y, floor: plan.floor };
    current.world.add(marker);
    current.marker = marker;
    pin.visible = !current.walk;
    marker.visible = Boolean(route) || plan.floor === floor;
    current.render();
    return () => {
      current.world.remove(marker);
      marker.traverse((item) => item.geometry?.dispose());
      glowMaterial.dispose();
      pinMaterial.dispose();
      if (current.marker === marker) current.marker = null;
      current.render();
    };
  }, [highlight]); // eslint-disable-line react-hooks/exhaustive-deps

  // The route: trail, start ring and the guide ball (animated in the render loop).
  useEffect(() => {
    const current = scene.current;
    if (!current || !route) return undefined;
    const group = buildRoute(route);
    if (!group) return undefined;
    current.world.add(group);
    current.walk = { group, level: null };
    if (current.marker) current.marker.userData.pin.visible = false;
    current.controls.autoRotate = false;
    current.render();
    return () => {
      current.world.remove(group);
      group.traverse((item) => item.geometry?.dispose());
      group.userData.materials.forEach((material) => material.dispose());
      if (current.walk?.group === group) current.walk = null;
      if (current.marker) current.marker.userData.pin.visible = true;
      current.render();
    };
  }, [route]);

  // POV on or off; going back to the overview puts the camera above the building again.
  useEffect(() => {
    const current = scene.current;
    if (!current) return;
    current.pov = pov;
    current.camera.fov = pov ? 60 : 32;
    current.camera.near = pov ? 0.1 : 1;
    current.camera.updateProjectionMatrix();
    current.controls.enabled = !pov;
    if (!pov) {
      current.controls.target.set(0, 0, 0);
      current.camera.position.set(0, 66, 82);
      if (current.walk) current.walk.pov = null;
    }
    current.render();
  }, [pov]);

  // Inside (floors) or outside (the real building).
  useEffect(() => {
    const current = scene.current;
    if (!current) return;
    current.view = view;
    const outside = view === "outside";
    current.exterior.visible = outside;
    if (current.walk) {
      current.walk.group.visible = !outside;
      current.walk.level = null;
    }
    if (current.marker) current.marker.visible = !outside && (Boolean(current.walk) || current.marker.userData.floor === floor);
    if (outside) {
      current.floors.forEach((item) => { item.group.visible = false; });
      // A low front-corner view, like a toy model on a table: the whole building fits.
      current.controls.target.set(0, 4, 0);
      current.camera.position.set(-58, 34, 92);
    } else if (!current.walk) {
      current.floor = null; // let the floor effect set the floors again
      showFloor(current, floor);
    }
    current.render();
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const current = scene.current;
    if (!current || current.walk || current.view === "outside") return;
    showFloor(current, floor);
  }, [floor]);

  const zoomBy = (factor) => {
    const current = scene.current;
    if (!current) return;
    const offset = current.camera.position.clone().sub(current.controls.target);
    offset.setLength(Math.min(170, Math.max(18, offset.length() * factor)));
    current.camera.position.copy(current.controls.target).add(offset);
    current.render();
  };

  if (failed) return fallback;
  return <div className={`ss-dollhouse ${className}`}>
    <div ref={holder} className="ss-dollhouse-canvas" role="img" aria-label={label} />
    {onOpen && <button type="button" className="ss-dollhouse-open" onClick={onOpen}>{openLabel}</button>}
    {zoom && <div className="ss-dollhouse-zoom" role="group" aria-label="Zoom">
      <button type="button" onClick={() => zoomBy(0.75)} aria-label="Zoom in">+</button>
      <button type="button" onClick={() => zoomBy(1.33)} aria-label="Zoom out">−</button>
    </div>}
    <span className="ss-dollhouse-hint" aria-hidden="true">{zoom ? "Drag to turn · pinch or scroll to zoom" : "Drag to turn · two fingers on phones"}</span>
  </div>;
}

// The chosen floor clearly, the floors below faintly, the floors above hidden.
function showFloor(current, floor) {
  if (current.floor === floor) return;
  current.floor = floor;
  if (current.marker) current.marker.visible = current.marker.userData.floor === floor;
  current.floors.forEach((item) => {
    item.group.visible = item.floor <= floor;
    const opacity = item.floor === floor ? 1 : 0.18;
    item.materials.forEach((material) => {
      material.opacity = material.isLineBasicMaterial ? opacity * 0.55 : opacity;
      material.depthWrite = item.floor === floor;
    });
  });
  // Keep the viewing angle; just move up or down to the chosen floor.
  const offset = current.camera.position.clone().sub(current.controls.target);
  current.controls.target.set(0, (floor - 1) * FLOOR_HEIGHT, 0);
  current.camera.position.copy(current.controls.target).add(offset);
  current.render();
}
