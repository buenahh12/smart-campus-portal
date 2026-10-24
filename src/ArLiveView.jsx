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
// you pick where you are, stand in that doorway facing the hallway, and tap START. The route
// from the floor plan is then laid on the floor from that spot and that heading.
//  - Chrome on Android (WebXR): the phone tracks your steps, so the arrows stay on the floor.
//  - Other phones (iPhone): the camera shows an arrow trail pointing the way by compass, and
//    you tap NEXT at each turn, because websites there cannot track position.
// Each floor is one leg; at the stairs you calibrate again at the stairway door.

const PHONE_HEIGHT = 1.35; // metres from the floor to a phone held in front of you
const ARROW_SPACING = 0.8;
const ARRIVE_DISTANCE = 1.5;
const OFF_ROUTE_DISTANCE = 4;
const CYAN = ["#20d8ec", "#10a6c2"];
const START_STORAGE = "campus-map-start"; // shared with the 2D map

const roomName = (floor, id) => FLOORS.find((item) => item.floor === floor)?.rooms.find((item) => item.id === id)?.name || "";
const stairsName = (floor, id) => roomName(floor, id).replace(/ \(.*\)/, "").toLowerCase();

// Splits a route into one walk per floor, in metres, with plan x to the right and z down.
// Exported (with legSegments) so the leg splitting can be checked outside the browser.
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
    const points = item.nodes.map((node) => ({ x: node.x * M, z: node.y * M }));
    const first = item.nodes[0];
    const last = item.nodes[item.nodes.length - 1];
    const next = all[index + 1];
    const length = points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - points[i].x, point.z - points[i].z), 0);
    return {
      floor: item.floor,
      points,
      length,
      from: index === 0 ? placeTitle(route.start) : `the ${stairsName(item.floor, first.room)}`,
      stairs: next ? `Take the ${stairsName(item.floor, last.room)} ${next.floor > item.floor ? "up" : "down"} to the ${floorLabel(next.floor).toLowerCase()}` : null,
    };
  });
}

// Straight stretches of a leg; from is the index of the point each one starts at.
export function legSegments(leg) {
  const segments = [];
  for (let i = 1; i < leg.points.length; i += 1) {
    const a = leg.points[i - 1];
    const b = leg.points[i];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.2) continue;
    const dir = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
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

// Compass guide steps: one per real turn, so NEXT is only needed at corners. Stepping out of a
// doorway or a short jog is folded into the next step, and a short final turn into the room is
// added to the last one.
export function legSteps(leg, firstLeg) {
  const segments = legSegments(leg);
  const phrase = (segment, first) => {
    const meters = `about ${Math.max(1, Math.round(segment.length))} m`;
    const short = segment.length < SHORT_STRETCH;
    if (segment.turn !== "straight") return short ? `turn ${segment.turn}` : `turn ${segment.turn} and walk ${meters}`;
    if (first) return short ? (firstLeg ? "step out into the hallway" : "step out of the stairway") : `walk ${meters}`;
    return short ? "go ahead a few steps" : `keep going ${meters}`;
  };
  const steps = [];
  let pending = [];
  segments.forEach((segment, index) => {
    pending.push(segment);
    if (segment.length < SHORT_STRETCH && index < segments.length - 1) return;
    const text = pending.map((item) => phrase(item, item === segments[0])).join(", then ");
    const length = pending.reduce((sum, item) => sum + item.length, 0);
    const previous = steps[steps.length - 1];
    if (previous && pending.every((item) => item.length < SHORT_STRETCH)) {
      previous.text += `, then ${text}`;
      previous.length += length;
    } else steps.push({ from: pending[0].from, text, length });
    pending = [];
  });
  return steps.map((step) => ({ ...step, text: step.text[0].toUpperCase() + step.text.slice(1) }));
}

// The point a given distance along a polyline (x/z), clamped to its ends.
function pointAlong(points, distance) {
  let left = Math.max(0, distance);
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= length && length > 0) return { x: a.x + ((b.x - a.x) * left) / length, z: a.z + ((b.z - a.z) * left) / length };
    left -= length;
  }
  return points[points.length - 1];
}

// The rest of the leg from a point index, cut off after a distance so the trail stays readable.
function trailFrom(points, from, maxLength) {
  const trail = [points[from]];
  let length = 0;
  for (let i = from + 1; i < points.length && length < maxLength; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const step = Math.hypot(b.x - a.x, b.z - a.z);
    const keep = Math.min(step, maxLength - length);
    trail.push(keep < step ? { x: a.x + ((b.x - a.x) * keep) / step, z: a.z + ((b.z - a.z) * keep) / step } : b);
    length += keep;
  }
  return trail;
}

// The direction you face in the starting doorway: from the door out to the hallway.
function legFacing(leg) {
  const [start, ...rest] = leg.points;
  const target = rest.find((point) => Math.hypot(point.x - start.x, point.z - start.z) > 0.3) || rest[0];
  const length = Math.hypot(target.x - start.x, target.z - start.z) || 1;
  return { x: (target.x - start.x) / length, z: (target.z - start.z) / length };
}

// Turns plan directions into the phone's world, given the heading the phone had at START.
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

// Distance walked along a polyline (x/z) and how far the point is from it.
function progressOn(points, x, z) {
  let walked = 0;
  let best = { along: 0, off: Infinity };
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz) || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (length * length)));
    const off = Math.hypot(a.x + t * dx - x, a.z + t * dz - z);
    if (off < best.off) best = { along: walked + t * length, off };
    walked += length;
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
  const [legIndex, setLegIndex] = useState(0);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [tracking, setTracking] = useState({ left: null, off: false, atEnd: false });
  const [problem, setProblem] = useState("");
  const [xrSupported, setXrSupported] = useState(false);
  const overlay = useRef(null);
  const video = useRef(null);
  const canvasHolder = useRef(null);
  const engine = useRef(null);

  const activeClosures = closures.items.filter((item) => isClosureActive(item));
  const blockedKey = activeClosures.map((item) => item.mapArea).filter(Boolean).sort().join("|");
  const route = useMemo(() => findRoute(fromKey, toKey, blockedAreas(activeClosures)), [fromKey, toKey, blockedKey, planVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const legs = useMemo(() => (route?.path ? routeLegs(route) : []), [route]);
  const leg = legs[legIndex];
  const lastLeg = legIndex === legs.length - 1;
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
    const materials = CYAN.map((color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }));
    const pinMaterial = new THREE.MeshBasicMaterial({ color: CYAN[0], transparent: true, opacity: 0.85 });
    // Drawn on top of everything so walls in the camera image never hide it.
    const guideMaterial = new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.95 });
    const guide = new THREE.Mesh(geometry, guideMaterial);
    guide.scale.setScalar(0.45);
    guide.renderOrder = 10;
    guide.visible = false;
    scene.add(guide);

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
      guide,
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
      // Lays arrows along a path given in world x/z, on the floor at height y.
      placeArrows(points, y, withPin) {
        arrows.clear();
        let carried = ARROW_SPACING / 2;
        let count = 0;
        for (let i = 1; i < points.length; i += 1) {
          const a = points[i - 1];
          const b = points[i];
          const length = Math.hypot(b.x - a.x, b.z - a.z);
          if (length < 0.01) continue;
          const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
          for (let d = carried; d < length; d += ARROW_SPACING) {
            const arrow = new THREE.Mesh(geometry, materials[count % 2]);
            arrow.position.set(a.x + ((b.x - a.x) * d) / length, y + 0.02, a.z + ((b.z - a.z) * d) / length);
            arrow.rotation.y = yaw;
            arrow.userData.along = count * ARROW_SPACING;
            arrows.add(arrow);
            count += 1;
          }
          carried = (carried - length) % ARROW_SPACING;
          if (carried < 0) carried += ARROW_SPACING;
        }
        if (withPin) {
          const end = points[points.length - 1];
          const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 12), pinMaterial);
          pin.position.set(end.x, y + 0.8, end.z);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.04, 8, 32), pinMaterial);
          ring.rotation.x = Math.PI / 2;
          ring.position.set(end.x, y + 0.03, end.z);
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
      [...materials, pinMaterial, guideMaterial].forEach((material) => material.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      engine.current = null;
    };
  }, []);

  // Phone tracking (WebXR): calibrate on the first frames, then follow progress along the leg.
  // The floor starts as an estimate (phone height) and moves to the real floor once ARCore finds
  // it under the centre of the camera. A guide arrow floats ahead of you, pointing along the route,
  // so there is always something to follow even when the floor is out of view.
  const startXrLeg = (index) => {
    const { renderer, camera, scene, arrows, guide } = engine.current;
    const current = legs[index];
    let frames = 0;
    let world = null;
    let estimatedFloor = 0;
    let along = 0;
    let lastReport = 0;
    const position = new THREE.Vector3();
    const forward = new THREE.Vector3();
    arrows.position.y = 0;
    renderer.setAnimationLoop((time, frame) => {
      renderer.render(scene, camera);
      frames += 1;
      const xrCamera = renderer.xr.getCamera();
      xrCamera.getWorldPosition(position);
      xrCamera.getWorldDirection(forward);
      if (!world && frames > 2) {
        const facing = Math.hypot(forward.x, forward.z) > 0.05 ? { x: forward.x, z: forward.z } : { x: 0, z: -1 };
        const length = Math.hypot(facing.x, facing.z);
        const rotate = rotation(legFacing(current), { x: facing.x / length, z: facing.z / length });
        const origin = current.points[0];
        world = current.points.map((point) => {
          const turned = rotate({ x: point.x - origin.x, z: point.z - origin.z });
          return { x: position.x + turned.x, z: position.z + turned.z };
        });
        estimatedFloor = position.y - PHONE_HEIGHT;
        engine.current.placeArrows(world, estimatedFloor, index === legs.length - 1);
      }
      if (!world) return;

      const hits = frame && engine.current.hitSource ? frame.getHitTestResults(engine.current.hitSource) : [];
      const floor = hits[0]?.getPose(renderer.xr.getReferenceSpace())?.transform.position.y;
      if (floor !== undefined && floor < position.y - 0.6) arrows.position.y = floor - estimatedFloor;

      const ahead = pointAlong(world, along + 3);
      const flat = Math.hypot(forward.x, forward.z) || 1;
      guide.position.set(position.x + (forward.x / flat) * 1.4, position.y - 0.45, position.z + (forward.z / flat) * 1.4);
      guide.rotation.y = Math.atan2(-(ahead.x - guide.position.x), -(ahead.z - guide.position.z));
      guide.visible = true;

      if (time - lastReport > 250) {
        lastReport = time;
        const progress = progressOn(world, position.x, position.z);
        along = progress.along;
        arrows.children.forEach((arrow) => { arrow.visible = arrow.userData.along === undefined || arrow.userData.along > along - 1; });
        const legLeft = Math.max(0, current.length - along);
        const later = legs.slice(index + 1).reduce((sum, item) => sum + item.length, 0);
        guide.visible = legLeft >= ARRIVE_DISTANCE;
        setTracking({ left: Math.round(legLeft + later), off: progress.off > OFF_ROUTE_DISTANCE, atEnd: legLeft < ARRIVE_DISTANCE });
      }
    });
  };

  // Compass guide: the camera turns with the phone; arrows point along the current stretch.
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

  // Compass guide: the whole path ahead (around the corners too) is laid out from where you
  // stand, starting at the current step.
  const segments = useMemo(() => (leg ? legSteps(leg, legIndex === 0) : []), [leg, legIndex]);
  const segment = segments[segmentIndex];
  useEffect(() => {
    if (mode !== "compass" || !leg || !segment) return;
    const state = compass.current;
    state.place = () => {
      const rotate = rotation(legFacing(leg), state.facing);
      const origin = leg.points[segment.from];
      const trail = trailFrom(leg.points, segment.from, 30).map((point) => rotate({ x: point.x - origin.x, z: point.z - origin.z }));
      engine.current.placeArrows(trail, 0, lastLeg);
    };
    if (state.facing) state.place();
  }, [mode, leg, segment, lastLeg]);

  const start = async () => {
    setProblem("");
    setLegIndex(0);
    setSegmentIndex(0);
    setTracking({ left: Math.round(legs.reduce((sum, item) => sum + item.length, 0)), off: false, atEnd: false });
    try { localStorage.setItem(START_STORAGE, fromKey); } catch { /* private mode */ }
    if (xrSupported) {
      engine.current.stopCamera();
      try {
        const session = await navigator.xr.requestSession("immersive-ar", { optionalFeatures: ["dom-overlay", "hit-test"], domOverlay: { root: overlay.current } });
        const { renderer } = engine.current;
        renderer.xr.setReferenceSpaceType("local");
        await renderer.xr.setSession(session);
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
          engine.current.guide.visible = false;
          setMode("setup");
          engine.current.startCamera();
        });
        setMode("xr");
        startXrLeg(0);
        return;
      } catch {
        engine.current.startCamera(); // AR session refused: use the compass guide instead
      }
    }
    setMode("compass");
    startCompass();
  };

  // Next floor (after the stairs) or next stretch (compass guide).
  const continueRoute = () => {
    if (mode === "compass" && segmentIndex < segments.length - 1) {
      setSegmentIndex(segmentIndex + 1);
      return;
    }
    if (lastLeg) return;
    const next = legIndex + 1;
    setLegIndex(next);
    setSegmentIndex(0);
    setTracking((current) => ({ ...current, atEnd: false }));
    if (mode === "xr") startXrLeg(next);
    else { compass.current.facing = null; }
  };

  // Lay the arrows again from where you stand now (back in the doorway, facing the hallway).
  const recenter = () => {
    setTracking((current) => ({ ...current, off: false, atEnd: false }));
    if (mode === "xr") startXrLeg(legIndex);
    else compass.current.facing = null;
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
    setTracking({ left: null, off: false, atEnd: false });
  };

  useEffect(() => () => {
    if (compass.current.listener) window.removeEventListener("deviceorientation", compass.current.listener);
  }, []);

  const select = (value, onChange, placeholder) => <label className="ar-live-pick">
    <span>{placeholder}: {value ? placeTitle(placeByKey(value)) : "Choose…"}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)} disabled={mode !== "setup"} aria-label={placeholder}>
      <option value="">Choose…</option>
      {placeOptions().map((group) => <optgroup key={group.floor} label={floorLabel(group.floor)}>
        {group.places.map((item) => <option key={item.key} value={item.key}>{placeTitle(item)}</option>)}
      </optgroup>)}
    </select>
  </label>;

  const destinationText = destination ? `${placeTitle(destination)} (${floorLabel(destination.floor)})` : "";
  let message;
  let action = null;
  if (problem) message = problem;
  else if (!fromKey || !toKey) message = "Choose where you are (From) and where you want to go (To).";
  else if (fromKey === toKey) message = "You are already there.";
  else if (route?.blocked) message = "No open route right now: a hallway or stairway on the way is closed.";
  else if (mode === "setup") message = `Stand in the doorway of ${placeTitle(placeByKey(fromKey))} with your back to the room, facing the hallway. Then tap START.`;
  else if (mode === "xr") {
    if (tracking.atEnd && lastLeg) message = `You have arrived at ${placeTitle(destination)}.`;
    else if (tracking.atEnd) {
      message = `${leg.stairs}. At the stairway door there, face the hallway and tap CONTINUE.`;
      action = "CONTINUE";
    } else if (tracking.off) message = "You are off the route. Walk back to the arrows, or tap Clear and start again from a doorway.";
    else message = `Follow the cyan arrows to ${destinationText}. ${tracking.left} m left`;
  } else if (segment) {
    message = `${segment.text}.`;
    if (segmentIndex < segments.length - 1) {
      message += " Tap NEXT at the turn.";
      action = "NEXT";
    }
    else if (!lastLeg) { message += ` ${leg.stairs}, then stand at the stairway door facing the hallway.`; action = "CONTINUE"; }
    else message += ` You will arrive at ${placeTitle(destination)}.`;
  }

  const ready = Boolean(route?.path) && mode === "setup";
  return <div ref={overlay} className={`ar-live ar-live-${mode}`} role="dialog" aria-modal="true" aria-label="AR live view">
    <video ref={video} className="ar-live-video" autoPlay playsInline muted />
    <div ref={canvasHolder} className="ar-live-canvas" aria-hidden="true" />
    <div className="ar-live-panel">
      <div className="ar-live-title">
        <b>SSCA NAVI</b>
        <button type="button" className="ar-live-button ar-live-small" onClick={() => { stop(); onClose(); }}>Close</button>
      </div>
      <div className="ar-live-grid">
        {select(fromKey, setFromKey, "From")}
        {select(toKey, setToKey, "To")}
        {action
          ? <button type="button" className="ar-live-button ar-live-primary" onClick={continueRoute}>{action}</button>
          : mode === "setup"
            ? <button type="button" className="ar-live-button ar-live-primary" onClick={start} disabled={!ready}>START</button>
            : <button type="button" className="ar-live-button" onClick={recenter}>RE-CENTER</button>}
        <button type="button" className="ar-live-button" onClick={clear}>Clear</button>
      </div>
      {inApp && mode === "setup" && <div className="ar-live-chrome">
        <span>{inApp} can&apos;t do full AR. Open this in Chrome so the arrows stay on the floor as you walk.</span>
        <a className="ar-live-button ar-live-small" href={chromeLink(fromKey, toKey)}>Open in Chrome</a>
      </div>}
      {mode !== "setup" && <p className="ar-live-mode">{mode === "xr" ? "AR tracking on · point the camera at the floor ahead" : "Compass guide: tap NEXT at each turn"}{leg ? ` · ${floorLabel(leg.floor)}` : ""}</p>}
    </div>
    <p className="ar-live-status" aria-live="polite">{message}</p>
  </div>;
}
