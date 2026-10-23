import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FLOORS, METERS_PER_UNIT as M, PLAN_HEIGHT, PLAN_WIDTH } from "./floorPlans";

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

export default function Dollhouse3D({ floor, onOpen, label, fallback }) {
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
    element.appendChild(renderer.domElement);

    const world = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 400);
    camera.position.set(0, 66, 82); // far enough that the whole 64 m building fits while it turns

    world.add(new THREE.HemisphereLight("#ffffff", "#c9c2b0", 2.2));
    const sun = new THREE.DirectionalLight("#ffffff", 1.6);
    sun.position.set(-30, 60, 40);
    world.add(sun);

    // Each floor gets its own materials so lower floors can be faded independently.
    const floors = FLOORS.map((plan) => {
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

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;
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
    const loop = () => { controls.update(); renderer.render(world, camera); };
    const visibility = new IntersectionObserver(([entry]) => {
      running = entry.isIntersecting;
      renderer.setAnimationLoop(running ? loop : null);
    });
    visibility.observe(element);

    scene.current = { floors, controls, camera, render: () => !running && loop() };
    return () => {
      visibility.disconnect();
      sizeObserver.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      world.traverse((item) => item.geometry?.dispose());
      floors.forEach(({ materials }) => materials.forEach((material) => material.dispose()));
      renderer.dispose();
      renderer.domElement.remove();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    const current = scene.current;
    if (!current) return;
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
  }, [floor]);

  if (failed) return fallback;
  return <div className="ss-dollhouse">
    <div ref={holder} className="ss-dollhouse-canvas" role="img" aria-label={label} />
    <button type="button" className="ss-dollhouse-open" onClick={onOpen}>Open plan</button>
    <span className="ss-dollhouse-hint" aria-hidden="true">Drag to turn · two fingers on phones</span>
  </div>;
}
