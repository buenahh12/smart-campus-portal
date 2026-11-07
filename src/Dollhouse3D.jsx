import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { BUILDING_NAME, FLOORS, METERS_PER_UNIT as M, PLAN_HEIGHT, PLAN_WIDTH } from "./floorPlans";
import { buildExterior, buildRoute } from "./building3d";

// 3D dollhouse of the Main Academic Building, built from the same rectangles as the 2D
// floor plan. The building method (floor slabs, 2.5 m walls with door gaps, stacked floors)
// follows SSCAFourFloorBuilder.cs from the SSCA NAVI AR app by Jan Lawrence Cambaya Florido.
// Floors above the chosen one are hidden and floors below are faded, like lifting the roof off.

const FLOOR_HEIGHT = 3.5;
const WALL_HEIGHT = 2.5;
const WALL_THICKNESS = 0.15;
const SLAB = 0.2;
const DOOR_WIDTH = 1.0;

const COLORS = {
  hall: "#ebe4d3",
  wall: "#f6efe1",
  edge: "#4a564f",
  stairs: "#e8c9a0",
  exit: "#e9a99f",
  deck: "#d7e0d1",
  room: { classroom: "#fbf8f1", office: "#e2ebdb", lab: "#dfe8ef", facility: "#f3e6d4", cr: "#e7e4ee" },
};

const roomColor = (item) => COLORS[item.type] || COLORS.room[item.type] || COLORS.room.classroom;

// Plan (x right, y down) to world (x right, z toward the viewer), centred on the building.
const toWorld = (x, y) => [(x - PLAN_WIDTH / 2) * M, (y - PLAN_HEIGHT / 2) * M];

// One edge of a room, split around the door if the door sits on it.
function wallSegments(rect, door) {
  const [x, y, w, h] = rect;
  const edges = [
    { a: [x, y], b: [x + w, y] },
    { a: [x, y + h], b: [x + w, y + h] },
    { a: [x, y], b: [x, y + h] },
    { a: [x + w, y], b: [x + w, y + h] },
  ];
  const gap = DOOR_WIDTH / M / 2;
  return edges.flatMap(({ a, b }) => {
    const horizontal = a[1] === b[1];
    const onEdge = door && (horizontal ? Math.abs(door[1] - a[1]) < 0.6 && door[0] >= a[0] && door[0] <= b[0]
      : Math.abs(door[0] - a[0]) < 0.6 && door[1] >= a[1] && door[1] <= b[1]);
    if (!onEdge) return [{ a, b }];
    const at = horizontal ? door[0] : door[1];
    const start = horizontal ? a[0] : a[1];
    const end = horizontal ? b[0] : b[1];
    const point = (value) => (horizontal ? [value, a[1]] : [a[0], value]);
    return [
      at - gap > start ? { a, b: point(at - gap) } : null,
      at + gap < end ? { a: point(at + gap), b } : null,
    ].filter(Boolean);
  });
}

function buildFloor(plan, materialFor) {
  const group = new THREE.Group();
  const box = (width, height, depth, color, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materialFor(color));
    mesh.position.set(x, y, z);
    group.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), materialFor(COLORS.edge, true));
    edges.position.copy(mesh.position);
    group.add(edges);
  };
  const slab = ([x, y, w, h], color, lift = 0) => {
    const [cx, cz] = toWorld(x + w / 2, y + h / 2);
    box(w * M, SLAB, h * M, color, cx, SLAB / 2 + lift, cz);
  };

  plan.halls.forEach((hall) => slab(hall.rect, COLORS.hall));
  plan.rooms.forEach((item) => {
    if (item.type === "void") return; // open court: nothing to stand on
    slab(item.rect, roomColor(item), 0.01);
    if (item.type === "deck") return;
    if (item.type === "stairs") {
      // A few steps rising across the stairwell so it reads as stairs from above.
      const [x, y, w, h] = item.rect;
      const steps = 5;
      for (let i = 0; i < steps; i += 1) {
        const [cx, cz] = toWorld(x + w / 2, y + (h * (i + 0.5)) / steps);
        box(w * M * 0.8, 0.25 * (i + 1), (h * M) / steps, COLORS.stairs, cx, SLAB + 0.125 * (i + 1), cz);
      }
    }
    wallSegments(item.rect, item.door).forEach(({ a, b }) => {
      const [ax, az] = toWorld(...a);
      const [bx, bz] = toWorld(...b);
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 0.05) return;
      const horizontal = az === bz;
      box(horizontal ? length : WALL_THICKNESS, WALL_HEIGHT, horizontal ? WALL_THICKNESS : length, COLORS.wall,
        (ax + bx) / 2, SLAB + WALL_HEIGHT / 2, (az + bz) / 2);
    });
  });
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
      const materialFor = (color, line = false) => {
        const key = `${color}${line}`;
        if (!materials.has(key)) {
          materials.set(key, line
            ? new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 })
            : new THREE.MeshLambertMaterial({ color, transparent: true }));
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
            material.opacity = material.isLineBasicMaterial ? opacity * 0.55 : opacity;
            material.depthWrite = item.floor === level;
          });
        });
      }
      ball.scale.setScalar(pov ? 0.55 : 1);
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
