import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { usePublicCollection } from "./CampusUpdates";
import { placeOptions } from "./CampusMap";
import { CMS_COLLECTIONS, isClosureActive } from "./cms";
import { inAppBrowserName } from "./firebase";
import { usePlanVersion } from "./usePlan";
import { FLOORS, METERS_PER_UNIT as M, blockedAreas, findRoute, floorLabel, graphNode, placeByKey, placeTitle } from "./floorPlans";
import "./ar.css";

// AR Live View in the browser. Like the SSCA NAVI AR app, nothing knows where you are by GPS:
// you pick where you are, stand in that doorway facing the hallway, and tap Start. The whole
// route from the floor plan, every floor and the stairs between them, is then laid out as one
// continuous trail from that spot and that heading.
//  - Chrome on Android (WebXR): the phone tracks your steps, up the stairs too, so the arrows
//    stay on the floor and on the steps all the way to the room.
//  - Other phones (iPhone): the camera shows an arrow trail pointing the way by compass, and
//    you tap Next at each turn and at the top of the stairs, because websites there cannot
//    track position.

const PHONE_HEIGHT = 1.35; // metres from the floor to a phone held in front of you
const FLOOR_HEIGHT = 3.5; // metres from one floor to the next (as in the 3D dollhouse)
const ARROW_SPACING = 0.8;
const ARRIVE_DISTANCE = 1.5;
const OFF_ROUTE_DISTANCE = 4;
const ARROW_COLORS = ["#f1c39a", "#e58a4e"]; // the site's peach, alternating with a deeper clay so the trail reads on light floors
const START_STORAGE = "campus-map-start"; // shared with the 2D map

const roomOn = (floor, id) => FLOORS.find((item) => item.floor === floor)?.rooms.find((item) => item.id === id);
const stairsName = (floor, id) => (roomOn(floor, id)?.name || "stairs").replace(/ \(.*\)/, "").toLowerCase();
const flat = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const distance3 = (a, b) => Math.hypot(b.x - a.x, (b.y || 0) - (a.y || 0), b.z - a.z);

// Splits a route into one walk per floor, in metres, with plan x to the right and z down.
// Exported (with routePath and routeSteps) so the route building can be checked outside the browser.
export function routeLegs(route) {
  const legs = [];
  let leg = null;
  route.path.forEach((id, index) => {
    if (route.via[index - 1]?.stairs) leg = null;
    const node = graphNode(id);
    if (node.kind === "room") return; // room centres: walking stops at the door
    if (!leg) legs.push(leg = { floor: node.floor, nodes: [] });
    const last = leg.nodes[leg.nodes.length - 1];
    if (!last || last.x !== node.x || last.y !== node.y) leg.nodes.push(node);
  });
  return legs.filter((item) => item.nodes.length > 1).map((item, index, all) => {
    const last = item.nodes[item.nodes.length - 1];
    const next = all[index + 1];
    return {
      floor: item.floor,
      points: item.nodes.map((node) => ({ x: node.x * M, z: node.y * M })),
      stairsRoom: next ? last.room : null,
      stairs: next ? `Take the ${stairsName(item.floor, last.room)} ${next.floor > item.floor ? "up" : "down"} to the ${floorLabel(next.floor).toLowerCase()}` : null,
    };
  });
}

// One staircase as you walk it: per floor, two flights along the stairwell with a landing at
// the far end (a switchback), rising or falling half a storey each.
function stairFlights(leg, toFloor, y) {
  const room = roomOn(leg.floor, leg.stairsRoom);
  if (!room) return [];
  const [rx, rz, rw, rh] = room.rect.map((value) => value * M);
  const center = { x: rx + rw / 2, z: rz + rh / 2 };
  const along = rw >= rh ? { x: 1, z: 0 } : { x: 0, z: 1 };
  const across = { x: -along.z, z: along.x };
  const reach = (Math.max(rw, rh) / 2) * 0.45; // a flight is shorter than the stairwell, which includes landings
  const side = Math.min(rw, rh) / 4;
  const door = leg.points[leg.points.length - 1];
  const near = ((door.x - center.x) * along.x + (door.z - center.z) * along.z) >= 0 ? reach : -reach;
  const at = (t, s, height) => ({ x: center.x + along.x * t + across.x * s, y: height, z: center.z + along.z * t + across.z * s });
  const rise = Math.sign(toFloor - leg.floor) * FLOOR_HEIGHT;
  const points = [];
  for (let flight = 0; flight < Math.abs(toFloor - leg.floor); flight += 1) {
    const base = y + flight * rise;
    points.push(at(near, side, base), at(-near, side, base + rise / 2), at(-near, -side, base + rise / 2), at(near, -side, base + rise));
  }
  return points;
}

// The whole route as one path: x/z from the plan, y up from the starting floor. Sections say
// which part is walking on a floor and which is a staircase; at[i] is the distance to point i.
export function routePath(route) {
  const legs = routeLegs(route);
  const points = [];
  const sections = [];
  const push = (point) => {
    const last = points[points.length - 1];
    if (!last || distance3(last, point) > 0.05) points.push(point);
  };
  legs.forEach((leg, index) => {
    const y = (leg.floor - legs[0].floor) * FLOOR_HEIGHT;
    const from = points.length;
    leg.points.forEach((point) => push({ x: point.x, y, z: point.z }));
    sections.push({ kind: "walk", floor: leg.floor, from, to: points.length - 1 });
    const next = legs[index + 1];
    if (next) {
      const stairsFrom = points.length - 1;
      stairFlights(leg, next.floor, y).forEach(push);
      sections.push({ kind: "stairs", floor: leg.floor, toFloor: next.floor, text: leg.stairs, from: stairsFrom, to: points.length });
    }
  });
  const at = points.map((point, index) => (index ? distance3(points[index - 1], point) : 0));
  at.forEach((value, index) => { if (index) at[index] += at[index - 1]; });
  sections.forEach((section) => {
    section.start = at[section.from];
    section.end = at[Math.min(section.to, points.length - 1)];
  });
  return { points, at, sections, length: at[at.length - 1] || 0 };
}

// Straight stretches of a walk; from is the index of the point each one starts at.
function walkSegments(points) {
  const segments = [];
  for (let i = 1; i < points.length; i += 1) {
    const length = flat(points[i - 1], points[i]);
    if (length < 0.2) continue;
    const dir = { x: (points[i].x - points[i - 1].x) / length, z: (points[i].z - points[i - 1].z) / length };
    const previous = segments[segments.length - 1];
    if (previous && previous.dir.x * dir.x + previous.dir.z * dir.z > 0.94) {
      previous.length += length;
      continue;
    }
    const cross = previous ? previous.dir.x * dir.z - previous.dir.z * dir.x : 0;
    segments.push({ from: i - 1, dir, length, turn: !previous || Math.abs(cross) < 0.34 ? "straight" : cross > 0 ? "right" : "left" });
  }
  return segments;
}

const SHORT_STRETCH = 2.5; // metres; shorter stretches are folded into the next step

// Compass guide steps for the whole route: one per real turn, plus one for each staircase.
// Stepping out of a doorway or a short jog is folded into the next step, and a short final turn
// into the room is added to the last one.
export function routeSteps(path) {
  const steps = [];
  path.sections.forEach((section, sectionIndex) => {
    if (section.kind === "stairs") {
      steps.push({ from: section.from, until: section.to, floor: section.floor, toFloor: section.toFloor, text: section.text, stairs: true });
      return;
    }
    const segments = walkSegments(path.points.slice(section.from, section.to + 1));
    const phrase = (segment, first) => {
      const meters = `about ${Math.max(1, Math.round(segment.length))} m`;
      const short = segment.length < SHORT_STRETCH;
      if (segment.turn !== "straight") return short ? `turn ${segment.turn}` : `turn ${segment.turn} and walk ${meters}`;
      if (first) return short ? (sectionIndex === 0 ? "step out into the hallway" : "step out of the stairway") : `walk ${meters}`;
      return short ? "go ahead a few steps" : `keep going ${meters}`;
    };
    const walkSteps = [];
    let pending = [];
    segments.forEach((segment, index) => {
      pending.push(segment);
      if (segment.length < SHORT_STRETCH && index < segments.length - 1) return;
      const text = pending.map((item) => phrase(item, item === segments[0])).join(", then ");
      const previous = walkSteps[walkSteps.length - 1];
      if (previous && pending.every((item) => item.length < SHORT_STRETCH)) previous.text += `, then ${text}`;
      else walkSteps.push({ from: section.from + pending[0].from, until: section.to, floor: section.floor, text });
      pending = [];
    });
    steps.push(...walkSteps.map((step) => ({ ...step, text: step.text[0].toUpperCase() + step.text.slice(1) })));
  });
  return steps;
}

// The path from a point index, cut off at an index or after a distance so the trail stays readable.
function trailFrom(points, from, until, maxLength) {
  const trail = [points[from]];
  let length = 0;
  for (let i = from + 1; i <= Math.min(until, points.length - 1) && length < maxLength; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const step = distance3(a, b);
    const keep = Math.min(step, maxLength - length);
    const t = step ? keep / step : 1;
    trail.push({ x: a.x + (b.x - a.x) * t, y: (a.y || 0) + ((b.y || 0) - (a.y || 0)) * t, z: a.z + (b.z - a.z) * t });
    length += keep;
  }
  return trail;
}

// The point a distance along the path, and the walking direction there (the next stretch that
// actually moves across the floor, so standing at a door it points out into the hallway).
function anchorAt(path, distance) {
  const { points, at } = path;
  let i = 1;
  while (i < points.length - 1 && at[i] < distance) i += 1;
  const a = points[i - 1];
  const b = points[i];
  const t = at[i] > at[i - 1] ? Math.min(1, Math.max(0, (distance - at[i - 1]) / (at[i] - at[i - 1]))) : 0;
  const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
  let j = i;
  while (j < points.length - 1 && flat(point, points[j]) < 0.3) j += 1;
  const length = flat(point, points[j]) || 1;
  return { point, dir: { x: (points[j].x - point.x) / length, z: (points[j].z - point.z) / length } };
}

// Turns plan directions into the phone's world, given the heading the phone had at Start.
function rotation(from, to) {
  const angle = Math.atan2(to.z, to.x) - Math.atan2(from.z, from.x);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return (v) => ({ x: v.x * cos - v.z * sin, z: v.x * sin + v.z * cos });
}

function chevronGeometry() {
  const shape = new THREE.Shape();
  [[0, 0.3], [0.38, -0.1], [0.38, -0.3], [0, 0.02], [-0.38, -0.3], [-0.38, -0.1]].forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2); // lie flat, pointing to -z
  return geometry;
}

// Distance walked along a path and how far a point is from it. Height counts for half, so the
// same hallway on two floors is told apart without phone height changes throwing it off.
function progressOn(points, at, x, y, z) {
  let best = { along: 0, off: Infinity };
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = (b.y - a.y) / 2;
    const dz = b.z - a.z;
    const lengthSq = dx * dx + dy * dy + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + ((y - a.y) / 2) * dy + (z - a.z) * dz) / lengthSq));
    const off = Math.hypot(a.x + t * dx - x, a.y / 2 + t * dy - y / 2, a.z + t * dz - z);
    if (off < best.off) best = { along: at[i - 1] + t * (at[i] - at[i - 1]), off };
  }
  return best;
}

// ?from=2:room-204&to=3:cr-3-girls in the link picks the rooms (used when handing over to Chrome).
const linkPlace = (name) => placeByKey(new URLSearchParams(window.location.search).get(name))?.key || "";

const readStart = () => {
  if (linkPlace("from")) return linkPlace("from");
  try {
    return placeByKey(localStorage.getItem(START_STORAGE))?.key || "";
  } catch {
    return "";
  }
};

// Messenger, Facebook and other in-app browsers on Android have no WebXR; Chrome does.
function chromeLink(fromKey, toKey) {
  const params = new URLSearchParams({ "ar-live": "", ...(fromKey && { from: fromKey }), ...(toKey && { to: toKey }) });
  const path = `${window.location.host}${window.location.pathname}?${params}`;
  return `intent://${path}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(`https://${path}`)};end`;
}

export default function ArLiveView({ onClose, initialDestination = "" }) {
  const closures = usePublicCollection(CMS_COLLECTIONS.closures);
  const planVersion = usePlanVersion();
  const [fromKey, setFromKey] = useState(readStart);
  const [toKey, setToKey] = useState(() => linkPlace("to") || initialDestination || "");
  const inApp = /Android/i.test(navigator.userAgent) ? inAppBrowserName() : "";
  const [mode, setMode] = useState("setup"); // setup | xr | compass
  const [stepIndex, setStepIndex] = useState(0);
  const [tracking, setTracking] = useState({ left: null, off: false, atEnd: false, section: null });
  const [problem, setProblem] = useState("");
  const [welcome, setWelcome] = useState(true);
  const [xrSupported, setXrSupported] = useState(false);
  const overlay = useRef(null);
  const video = useRef(null);
  const canvasHolder = useRef(null);
  const engine = useRef(null);

  const activeClosures = closures.items.filter((item) => isClosureActive(item));
  const blockedKey = activeClosures.map((item) => item.mapArea).filter(Boolean).sort().join("|");
  const route = useMemo(() => findRoute(fromKey, toKey, blockedAreas(activeClosures)), [fromKey, toKey, blockedKey, planVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const path = useMemo(() => (route?.path ? routePath(route) : null), [route]);
  const steps = useMemo(() => (path ? routeSteps(path) : []), [path]);
  const step = steps[stepIndex];
  const destination = placeByKey(toKey);

  useEffect(() => {
    navigator.xr?.isSessionSupported?.("immersive-ar").then(setXrSupported, () => setXrSupported(false));
  }, []);

  // Camera preview behind the panel, and the 3D layer for the arrows.
  useEffect(() => {
    let stream = null;
    let stopped = false;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped) return stream.getTracks().forEach((track) => track.stop());
        video.current.srcObject = stream;
      } catch {
        setProblem("Allow camera access to use AR Live View. You can still pick rooms and read the directions.");
      }
    };
    startCamera();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.xr.enabled = true;
    canvasHolder.current.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 100);
    const arrows = new THREE.Group();
    scene.add(arrows);
    const geometry = chevronGeometry();
    const materials = ARROW_COLORS.map((color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }));
    const pinMaterial = new THREE.MeshBasicMaterial({ color: ARROW_COLORS[0], transparent: true, opacity: 0.85 });

    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", resize);
    resize();

    engine.current = {
      renderer,
      camera,
      scene,
      arrows,
      hitSource: null,
      stopCamera: () => {
        stopped = true;
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
      },
      startCamera: () => {
        stopped = false;
        startCamera();
      },
      // Lays arrows along a path of world points (x, y, z); y is the floor or step height there.
      placeArrows(points, withPin) {
        arrows.clear();
        let walked = 0;
        let next = ARROW_SPACING / 2;
        let count = 0;
        for (let i = 1; i < points.length; i += 1) {
          const a = points[i - 1];
          const b = points[i];
          const length = distance3(a, b);
          if (flat(a, b) > 0.01) {
            const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
            for (; next < walked + length; next += ARROW_SPACING) {
              const t = (next - walked) / length;
              const arrow = new THREE.Mesh(geometry, materials[count % 2]);
              arrow.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + 0.02, a.z + (b.z - a.z) * t);
              arrow.rotation.y = yaw;
              arrow.userData.along = next;
              arrows.add(arrow);
              count += 1;
            }
          }
          walked += length;
          next = Math.max(next, walked);
        }
        if (withPin) {
          const end = points[points.length - 1];
          const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 12), pinMaterial);
          pin.position.set(end.x, end.y + 0.8, end.z);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.04, 8, 32), pinMaterial);
          ring.rotation.x = Math.PI / 2;
          ring.position.set(end.x, end.y + 0.03, end.z);
          arrows.add(pin, ring);
        }
      },
    };

    return () => {
      window.removeEventListener("resize", resize);
      renderer.setAnimationLoop(null);
      renderer.xr.getSession()?.end().catch(() => {});
      engine.current.stopCamera();
      arrows.traverse((item) => { if (item.geometry !== geometry) item.geometry?.dispose(); });
      geometry.dispose();
      [...materials, pinMaterial].forEach((material) => material.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      engine.current = null;
    };
  }, []);

  // Phone tracking (WebXR). The whole route is placed once from where you stand: at Start that
  // is the starting doorway; Re-center places it again from the spot on the route you have
  // reached, facing the way the arrows go. The floor starts as an estimate (phone height) and
  // moves to the floor ARCore finds under the camera, while you are still on that level.
  const startXr = () => {
    const { renderer, camera, scene, arrows } = engine.current;
    const position = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const state = { frames: 0, world: null, along: 0, anchorAlong: 0, levelY: 0, lastReport: 0 };
    engine.current.recenter = () => {
      state.anchorAlong = state.along;
      state.world = null;
      state.frames = 0;
    };
    renderer.setAnimationLoop((time, frame) => {
      renderer.render(scene, camera);
      state.frames += 1;
      const xrCamera = renderer.xr.getCamera();
      xrCamera.getWorldPosition(position);
      xrCamera.getWorldDirection(forward);
      if (!state.world && state.frames > 2) {
        const length = Math.hypot(forward.x, forward.z);
        const facing = length > 0.05 ? { x: forward.x / length, z: forward.z / length } : { x: 0, z: -1 };
        const { point, dir } = anchorAt(path, state.anchorAlong);
        const rotate = rotation(dir, facing);
        const base = position.y - PHONE_HEIGHT - point.y;
        state.world = path.points.map((item) => {
          const turned = rotate({ x: item.x - point.x, z: item.z - point.z });
          return { x: position.x + turned.x, y: base + item.y, z: position.z + turned.z };
        });
        state.levelY = position.y;
        arrows.position.y = 0;
        engine.current.placeArrows(state.world, true);
      }
      if (!state.world) return;

      const onStartLevel = Math.abs(position.y - state.levelY) < 1;
      const hits = onStartLevel && frame && engine.current.hitSource ? frame.getHitTestResults(engine.current.hitSource) : [];
      const floor = hits[0]?.getPose(renderer.xr.getReferenceSpace())?.transform.position.y;
      if (floor !== undefined && floor < position.y - 0.6) arrows.position.y = floor - (state.levelY - PHONE_HEIGHT);

      if (time - state.lastReport > 250) {
        state.lastReport = time;
        const feet = position.y - PHONE_HEIGHT - arrows.position.y;
        const { along, off } = progressOn(state.world, path.at, position.x, feet, position.z);
        state.along = along;
        arrows.children.forEach((arrow) => { arrow.visible = arrow.userData.along === undefined || arrow.userData.along > along - 1; });
        const left = Math.max(0, path.length - along);
        const section = path.sections.find((item) => item.kind === "stairs" && along >= item.start - 1 && along <= item.end)
          || path.sections.find((item) => along >= item.start && along <= item.end) || path.sections[0];
        setTracking({ left: Math.round(left), off: off > OFF_ROUTE_DISTANCE, atEnd: left < ARRIVE_DISTANCE, section });
      }
    });
  };

  // Compass guide: the camera turns with the phone; the heading at Start lines the plan up.
  const compass = useRef({ quaternion: new THREE.Quaternion(), facing: null, listener: null });
  const startCompass = async () => {
    const Orientation = window.DeviceOrientationEvent;
    if (typeof Orientation?.requestPermission === "function") {
      try {
        if (await Orientation.requestPermission() !== "granted") throw new Error("denied");
      } catch {
        setProblem("Allow motion and orientation access so the arrows can turn with your phone.");
      }
    }
    const state = compass.current;
    const euler = new THREE.Euler();
    const screenFix = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // camera looks out of the back of the phone
    const zAxis = new THREE.Vector3(0, 0, 1);
    const turn = new THREE.Quaternion();
    if (state.listener) window.removeEventListener("deviceorientation", state.listener);
    state.listener = (event) => {
      if (event.alpha === null) return;
      const rad = THREE.MathUtils.DEG2RAD;
      const orient = (screen.orientation?.angle ?? window.orientation ?? 0) * rad;
      euler.set(event.beta * rad, event.alpha * rad, -event.gamma * rad, "YXZ");
      state.quaternion.setFromEuler(euler).multiply(screenFix).multiply(turn.setFromAxisAngle(zAxis, -orient));
      state.ready = true;
    };
    window.addEventListener("deviceorientation", state.listener);
    state.facing = null;
    state.rotate = null;
    const { renderer, camera, scene } = engine.current;
    camera.position.set(0, PHONE_HEIGHT, 0);
    const forward = new THREE.Vector3();
    renderer.setAnimationLoop(() => {
      if (state.ready) camera.quaternion.copy(state.quaternion);
      if (state.ready && !state.facing) {
        camera.getWorldDirection(forward);
        const length = Math.hypot(forward.x, forward.z) || 1;
        state.facing = { x: forward.x / length, z: forward.z / length };
        state.place?.();
      }
      renderer.render(scene, camera);
    });
  };

  // Compass guide: the trail of the current step (around its corners, or through the stairwell)
  // is laid out flat from where you stand. The plan is lined up once, with the heading you face
  // at Start (or Re-center): the way the current step begins.
  const lastStep = stepIndex === steps.length - 1;
  useEffect(() => {
    if (mode !== "compass" || !path || !step) return;
    const state = compass.current;
    state.place = () => {
      state.rotate ||= rotation(anchorAt(path, path.at[step.from]).dir, state.facing);
      const { rotate } = state;
      const origin = path.points[step.from];
      const trail = trailFrom(path.points, step.from, step.until, 30).map((point) => ({ ...rotate({ x: point.x - origin.x, z: point.z - origin.z }), y: 0 }));
      engine.current.placeArrows(trail, lastStep);
    };
    if (state.facing) state.place();
  }, [mode, path, step, lastStep]);

  const start = async () => {
    setProblem("");
    setStepIndex(0);
    setTracking({ left: Math.round(path.length), off: false, atEnd: false, section: path.sections[0] });
    try { localStorage.setItem(START_STORAGE, fromKey); } catch { /* private mode */ }
    if (xrSupported) {
      engine.current.stopCamera();
      try {
        const session = await navigator.xr.requestSession("immersive-ar", { optionalFeatures: ["dom-overlay", "hit-test"], domOverlay: { root: overlay.current } });
        const { renderer } = engine.current;
        renderer.xr.setReferenceSpaceType("local");
        // three.js draws through WebXR projection layers when the browser offers them, but on
        // Android phones nothing drawn that way showed over the camera. Hide that API while the
        // session starts so three.js uses the classic XRWebGLLayer, which does show.
        const layersApi = window.XRWebGLBinding?.prototype;
        const projectionLayer = layersApi && Object.getOwnPropertyDescriptor(layersApi, "createProjectionLayer");
        if (projectionLayer) delete layersApi.createProjectionLayer;
        try {
          await renderer.xr.setSession(session);
        } finally {
          if (projectionLayer && !Object.hasOwn(layersApi, "createProjectionLayer")) Object.defineProperty(layersApi, "createProjectionLayer", projectionLayer);
        }
        // Ray from the middle of the camera, used to find the real floor.
        session.requestReferenceSpace("viewer")
          .then((space) => session.requestHitTestSource?.({ space }))
          .then((source) => { if (engine.current) engine.current.hitSource = source || null; })
          .catch(() => {});
        session.addEventListener("end", () => {
          renderer.setAnimationLoop(null);
          if (!engine.current) return;
          engine.current.hitSource?.cancel?.();
          engine.current.hitSource = null;
          engine.current.arrows.clear();
          setMode("setup");
          engine.current.startCamera();
        });
        setMode("xr");
        startXr();
        return;
      } catch {
        engine.current.startCamera(); // AR session refused: use the compass guide instead
      }
    }
    setMode("compass");
    startCompass();
  };

  // Compass guide: on to the next turn or staircase.
  const nextStep = () => setStepIndex((index) => Math.min(index + 1, steps.length - 1));

  // Lay the arrows again from where you stand now, facing the way they should go.
  const recenter = () => {
    setTracking((current) => ({ ...current, off: false }));
    if (mode === "xr") engine.current.recenter?.();
    else {
      compass.current.facing = null;
      compass.current.rotate = null;
    }
  };

  const stop = () => {
    const { renderer, arrows } = engine.current;
    if (renderer.xr.getSession()) renderer.xr.getSession().end().catch(() => {});
    else {
      renderer.setAnimationLoop(null);
      arrows.clear();
      setMode("setup");
    }
  };

  const clear = () => {
    if (mode !== "setup") stop();
    setToKey("");
    setTracking({ left: null, off: false, atEnd: false, section: null });
  };

  useEffect(() => () => {
    if (compass.current.listener) window.removeEventListener("deviceorientation", compass.current.listener);
  }, []);

  const select = (value, onChange, placeholder) => <label className="ar-live-pick">
    <small>{placeholder}</small>
    <span>{value ? placeTitle(placeByKey(value)) : "Choose a room"}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)} disabled={mode !== "setup"} aria-label={placeholder}>
      <option value="">Choose…</option>
      {placeOptions().map((group) => <optgroup key={group.floor} label={floorLabel(group.floor)}>
        {group.places.map((item) => <option key={item.key} value={item.key}>{placeTitle(item)}</option>)}
      </optgroup>)}
    </select>
  </label>;

  const destinationText = destination ? `${placeTitle(destination)} (${floorLabel(destination.floor)})` : "";
  let message;
  let showNext = false;
  if (problem) message = problem;
  else if (!fromKey || !toKey) message = "Choose where you are (From) and where you want to go (To).";
  else if (fromKey === toKey) message = "You are already there.";
  else if (route?.blocked) message = "No open route right now: a hallway or stairway on the way is closed.";
  else if (mode === "setup") message = `Stand in the doorway of ${placeTitle(placeByKey(fromKey))} with your back to the room, facing the hallway. Then tap Start.`;
  else if (mode === "xr") {
    const { section } = tracking;
    if (tracking.atEnd) message = `You have arrived at ${placeTitle(destination)}.`;
    else if (tracking.off) message = "You are off the route. Walk back to the arrows, or stand where they are, face the way they point and tap Re-center.";
    else if (section?.kind === "stairs") message = `${section.text}, following the arrows on the steps. ${tracking.left} m left`;
    else message = `Follow the arrows to ${destinationText}. ${tracking.left} m left`;
  } else if (step) {
    message = `${step.text}.`;
    if (lastStep) message += ` You will arrive at ${placeTitle(destination)}.`;
    else {
      message += step.stairs ? ` Tap Next on the ${floorLabel(step.toFloor).toLowerCase()}.` : " Tap Next at the turn.";
      showNext = true;
    }
  }

  const floorNow = mode === "xr" ? tracking.section : step;
  const floorText = floorNow ? (floorNow.toFloor ? `${floorLabel(floorNow.floor)} → ${floorLabel(floorNow.toFloor)}` : floorLabel(floorNow.floor)) : "";
  const ready = Boolean(path) && mode === "setup";
  const close = () => { stop(); onClose(); };
  return <div ref={overlay} className={`ar-live ar-live-${mode}`} role="dialog" aria-modal="true" aria-label="AR live view">
    <video ref={video} className="ar-live-video" autoPlay playsInline muted />
    <div ref={canvasHolder} className="ar-live-canvas" aria-hidden="true" />
    {welcome && <div className="ar-live-welcome">
      <div className="ar-live-welcome-card">
        <span className="ar-live-overline">{"// SSCA NAVI"}</span>
        <h2>Welcome to <span>AR live view</span></h2>
        <p>Point your phone down the hallway and follow the arrows on the floor to any room in the Main Academic Building.</p>
        <ol>
          <li><b>Choose</b> where you are and where you want to go.</li>
          <li><b>Stand in the doorway</b> with your back to the room, facing the hallway, and tap Start.</li>
          <li><b>Follow the arrows</b> along the hallways and up or down the stairs, all the way to the room.</li>
        </ol>
        <p className="ar-live-tip">{xrSupported ? "Hold your phone up and point the camera at the floor ahead." : inApp ? `${inApp} can't track the floor. For the full AR view, open this in Chrome.` : "This phone uses the compass guide: the arrows turn with your phone, and you tap Next at each turn."}</p>
        <div className="ar-live-welcome-actions">
          <button type="button" className="ar-live-button ar-live-primary" onClick={() => setWelcome(false)}>Get started</button>
          {inApp
            ? <a className="ar-live-button" href={chromeLink(fromKey, toKey)}>Open in Chrome</a>
            : <button type="button" className="ar-live-button" onClick={close}>Not now</button>}
        </div>
      </div>
    </div>}
    <div className="ar-live-panel">
      <div className="ar-live-title">
        <div>
          <span className="ar-live-overline">{"// AR live view"}</span>
          <b>SSCA NAVI</b>
        </div>
        <button type="button" className="ar-live-button ar-live-small" onClick={close}>Close</button>
      </div>
      <div className="ar-live-grid">
        {select(fromKey, setFromKey, "From")}
        {select(toKey, setToKey, "To")}
        {showNext
          ? <button type="button" className="ar-live-button ar-live-primary" onClick={nextStep}>Next</button>
          : mode === "setup"
            ? <button type="button" className="ar-live-button ar-live-primary" onClick={start} disabled={!ready}>Start</button>
            : <button type="button" className="ar-live-button" onClick={recenter}>Re-center</button>}
        <button type="button" className="ar-live-button" onClick={clear}>Clear</button>
      </div>
      {inApp && mode === "setup" && !welcome && <div className="ar-live-chrome">
        <span>{inApp} can&apos;t do full AR. Open this in Chrome so the arrows stay on the floor as you walk.</span>
        <a className="ar-live-button ar-live-small" href={chromeLink(fromKey, toKey)}>Open in Chrome</a>
      </div>}
      {mode !== "setup" && <p className="ar-live-mode">{mode === "xr" ? "AR on · point the camera at the floor ahead" : "Compass guide · tap Next at each turn"}{floorText ? ` · ${floorText}` : ""}</p>}
    </div>
    {!welcome && <p className="ar-live-status" aria-live="polite">{message}</p>}
  </div>;
}
