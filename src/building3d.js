import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BUILDING_NAME, METERS_PER_UNIT as M, PLAN_HEIGHT, PLAN_WIDTH, buildingOf, graphNode } from "./floorPlans";

// The outside of the Main Academic Building and the guide-ball route, for the 3D dollhouse.
// Sizes come from the 2D floor plans (1 plan unit = 0.4 m); the look comes from photos of the
// building: lime green walls with a dark green base, ledges at each floor, glass-block windows,
// the school's name across the front, a maroon arched canopy over the side entrance, and a
// mint-teal back with green outdoor fire stairs. The side and roof that weren't photographed
// follow the photographed side and the 4th-floor plan (its roof deck is open).

export const FLOOR_HEIGHT = 3.5;
const W = PLAN_WIDTH * M; // 64 m
const D = PLAN_HEIGHT * M; // 40 m
const X0 = -W / 2;
const Z0 = -D / 2;
const toWorld = (x, y) => [(x - PLAN_WIDTH / 2) * M, (y - PLAN_HEIGHT / 2) * M];

const COLORS = {
  lime: "#8fd44c",
  limeLight: "#a6e263",
  base: "#2f7a36",
  teal: "#86cdb5",
  roof: "#c9d1c0",
  deck: "#b8c3ad",
  canopy: "#7a2b28",
  steel: "#1f5a40",
};

// A soft, slightly lumpy surface, like modelling clay (used as a bump map on every clay part).
let clayBump = null;
function clayTexture() {
  if (clayBump) return clayBump;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  g.fillStyle = "#808080";
  g.fillRect(0, 0, size, size);
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 900; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const r = 4 + random() * 18;
    const shade = Math.round(110 + random() * 40);
    const gradient = g.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `rgba(${shade},${shade},${shade},0.35)`);
    gradient.addColorStop(1, "rgba(128,128,128,0)");
    g.fillStyle = gradient;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  clayBump = new THREE.CanvasTexture(canvas);
  clayBump.wrapS = THREE.RepeatWrapping;
  clayBump.wrapT = THREE.RepeatWrapping;
  clayBump.repeat.set(3, 3);
  return clayBump;
}

// Glass blocks: a light grid, drawn once and shared by every window.
function glassBlockTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  g.fillStyle = "#7f8c8d";
  g.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const gradient = g.createLinearGradient(col * 32, row * 32, col * 32 + 32, row * 32 + 32);
      gradient.addColorStop(0, "#eef3f4");
      gradient.addColorStop(1, "#b9c6ca");
      g.fillStyle = gradient;
      g.fillRect(col * 32 + 3, row * 32 + 3, 26, 26);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// The painted name band across the front.
function signTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 160;
  const g = canvas.getContext("2d");
  g.fillStyle = "#97d951";
  g.fillRect(0, 0, 2048, 160);
  g.strokeStyle = "#1d6b2c";
  g.lineWidth = 10;
  g.strokeRect(5, 5, 2038, 150);
  // Logo: a white seal with a coloured cube.
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.arc(95, 80, 62, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#1d6b2c";
  g.lineWidth = 6;
  g.stroke();
  [["#2f6fd1", 70, 62], ["#e2502f", 98, 52], ["#2fa04f", 88, 86]].forEach(([color, x, y]) => {
    g.fillStyle = color;
    g.fillRect(x, y, 26, 26);
  });
  g.font = "bold 104px Archivo, Arial Narrow, Arial, sans-serif";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 10;
  g.strokeStyle = "#f3d33b";
  g.strokeText("SAINT SIMON OF CYRENE ACADEMY", 190, 86);
  g.fillStyle = "#1d6b2c";
  g.fillText("SAINT SIMON OF CYRENE ACADEMY", 190, 86);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildExterior() {
  const group = new THREE.Group();
  const materials = new Map();
  const mat = (key, make) => {
    if (!materials.has(key)) materials.set(key, make());
    return materials.get(key);
  };
  // Matte clay: rough, no shine, a gentle bumpy surface.
  const solid = (color) => mat(color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, bumpMap: clayTexture(), bumpScale: 0.6 }));
  const add = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  // A rounded clay block (soft edges, like the reference model).
  const soft = (w, h, d, radius = 0.35) => new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2.1, h / 2.1, d / 2.1));
  // A wall from (x1, z1) to (x2, z2), from height y0, h tall, t thick.
  const wall = (x1, z1, x2, z2, y0, h, color, t = 0.3) => {
    const length = Math.hypot(x2 - x1, z2 - z1);
    const mesh = add(soft(length + t, h, t, 0.25), solid(color), (x1 + x2) / 2, y0 + h / 2, (z1 + z2) / 2);
    mesh.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    return mesh;
  };
  const glass = mat("glass", () => new THREE.MeshStandardMaterial({ map: glassBlockTexture(), roughness: 0.55 }));
  const windowsAlong = (x1, z1, x2, z2, y, outward, skip = () => false) => {
    const length = Math.hypot(x2 - x1, z2 - z1);
    const count = Math.max(1, Math.floor((length - 4) / 5.5));
    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.5) / count;
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      if (skip(x, z, y)) continue;
      const turn = Math.atan2(outward[0], outward[1]);
      const frame = add(soft(1.9, 1.8, 0.2, 0.08), solid("#f4f1e6"), x + outward[0] * 0.18, y, z + outward[1] * 0.18);
      frame.rotation.y = turn;
      const pane = add(new THREE.PlaneGeometry(1.5, 1.4), glass, x + outward[0] * 0.29, y, z + outward[1] * 0.29);
      pane.rotation.y = turn;
      const sill = add(soft(2.2, 0.18, 0.45, 0.08), solid("#f4f1e6"), x + outward[0] * 0.32, y - 0.95, z + outward[1] * 0.32);
      sill.rotation.y = turn;
    }
  };
  const H3 = FLOOR_HEIGHT * 3;
  const H4 = FLOOR_HEIGHT * 4;
  // Back wall: mint-teal in the middle, lime at the corner wings.
  const backColor = (x) => (x > X0 + 8 && x < -X0 - 8 ? COLORS.teal : COLORS.lime);

  // Floors 1-3: the full plan outline.
  wall(X0, D / 2, -X0, D / 2, 0, H3, COLORS.lime); // front
  wall(X0, Z0, X0, D / 2, 0, H3, COLORS.lime); // entrance side
  wall(-X0, Z0, -X0, D / 2, 0, H3, COLORS.lime); // other side
  wall(X0, Z0, X0 + 8, Z0, 0, H3, COLORS.lime);
  wall(X0 + 8, Z0, -X0 - 8, Z0, 0, H3, COLORS.teal);
  wall(-X0 - 8, Z0, -X0, Z0, 0, H3, COLORS.lime);

  // 4th floor: everything except the open roof deck (plan x 42-160, y 70-100).
  const [deckX, deckZ] = toWorld(42, 70);
  wall(X0, Z0, -X0, Z0, H3, FLOOR_HEIGHT, COLORS.lime);
  wall(-X0, Z0, -X0, deckZ, H3, FLOOR_HEIGHT, COLORS.lime);
  wall(deckX, deckZ, -X0, deckZ, H3, FLOOR_HEIGHT, COLORS.lime);
  wall(deckX, deckZ, deckX, D / 2, H3, FLOOR_HEIGHT, COLORS.lime);
  wall(X0, D / 2, deckX, D / 2, H3, FLOOR_HEIGHT, COLORS.lime);
  wall(X0, Z0, X0, D / 2, H3, FLOOR_HEIGHT, COLORS.lime);

  // Roofs: the 4th floor's roof, and the roof deck with a low wall around it.
  add(soft(W + 0.6, 0.6, deckZ - Z0 + 0.6, 0.28), solid(COLORS.roof), 0, H4 + 0.3, (Z0 + deckZ) / 2);
  add(soft(deckX - X0 + 0.6, 0.6, D / 2 - deckZ + 0.3, 0.28), solid(COLORS.roof), (X0 + deckX) / 2, H4 + 0.3, (deckZ + D / 2) / 2);
  add(soft(-X0 - deckX, 0.4, D / 2 - deckZ, 0.2), solid(COLORS.deck), (deckX - X0) / 2, H3 + 0.2, (deckZ + D / 2) / 2);
  wall(deckX, D / 2, -X0, D / 2, H3, 1, COLORS.lime, 0.25);
  wall(-X0, deckZ, -X0, D / 2, H3, 1, COLORS.lime, 0.25);

  // Ledges between floors, and the dark green base.
  const ledge = (y, outline) => outline.forEach(([x1, z1, x2, z2]) => wall(x1, z1, x2, z2, y, 0.28, COLORS.limeLight, 0.9));
  const fullOutline = [[X0, Z0, -X0, Z0], [-X0, Z0, -X0, D / 2], [-X0, D / 2, X0, D / 2], [X0, D / 2, X0, Z0]];
  [FLOOR_HEIGHT, FLOOR_HEIGHT * 2, H3].forEach((y) => ledge(y, fullOutline));
  ledge(H4, [[X0, Z0, -X0, Z0], [-X0, Z0, -X0, deckZ], [-X0, deckZ, deckX, deckZ], [deckX, deckZ, deckX, D / 2], [deckX, D / 2, X0, D / 2], [X0, D / 2, X0, Z0]]);
  fullOutline.forEach(([x1, z1, x2, z2]) => wall(x1, z1, x2, z2, 0, 0.9, COLORS.base, 0.42));

  // Glass-block windows on every floor (not where the sign or the canopy are).
  const [signLeft] = toWorld(55, 0);
  const [signRight] = toWorld(152, 0);
  const signY = FLOOR_HEIGHT * 2 + 1.75;
  for (let level = 0; level < 4; level += 1) {
    const y = level * FLOOR_HEIGHT + 1.75;
    const front = level < 3 ? [X0, -X0] : [X0, deckX];
    windowsAlong(front[0], D / 2, front[1], D / 2, y, [0, 1], (x) => level === 2 && x > signLeft && x < signRight);
    windowsAlong(X0, D / 2, X0, Z0, y, [-1, 0], (x, z) => level === 0 && z > -3 && z < 9);
    windowsAlong(-X0, Z0, -X0, level < 3 ? D / 2 : deckZ, y, [1, 0]);
    windowsAlong(-X0, Z0, X0, Z0, y, [0, -1], (x) => x > X0 + 2 && x < X0 + 11);
  }

  // The school's name across the front, on the 3rd floor.
  const sign = add(new THREE.PlaneGeometry(signRight - signLeft, 1.8), mat("sign", () => new THREE.MeshLambertMaterial({ map: signTexture() })), (signLeft + signRight) / 2, signY, D / 2 + 0.19);
  sign.rotation.y = 0;

  // The maroon arched canopy over the side entrance, on four posts.
  const [, entranceZ] = toWorld(0, 57);
  const canopy = add(new THREE.CylinderGeometry(2.3, 2.3, 11, 28, 1, true, Math.PI / 2, Math.PI), mat("canopy", () => new THREE.MeshLambertMaterial({ color: COLORS.canopy, side: THREE.DoubleSide })), X0 - 2.3, 3.3, entranceZ);
  canopy.rotation.x = Math.PI / 2;
  [-4.8, 0, 4.8].forEach((dz) => add(new THREE.CylinderGeometry(0.08, 0.08, 3.3, 8), solid("#3b3b3b"), X0 - 4.4, 1.65, entranceZ + dz));

  // Green outdoor fire stairs at the back, zig-zagging up to the 4th floor.
  const [fx1] = toWorld(6, 0);
  const [fx2] = toWorld(26, 0);
  const fz = Z0 - 1.4;
  const steel = solid(COLORS.steel);
  for (let level = 1; level <= 4; level += 1) {
    const y = level * FLOOR_HEIGHT;
    if (level > 1) add(new THREE.BoxGeometry(fx2 - fx1, 0.15, 2.2), steel, (fx1 + fx2) / 2, y - FLOOR_HEIGHT + 0.07, fz);
    const [from, to] = level % 2 ? [fx1, fx2] : [fx2, fx1];
    const run = Math.abs(to - from);
    const flight = add(new THREE.BoxGeometry(Math.hypot(run, FLOOR_HEIGHT), 0.22, 1.6), steel, (from + to) / 2, y - FLOOR_HEIGHT / 2, fz);
    flight.rotation.z = Math.sign(to - from) * Math.atan2(FLOOR_HEIGHT, run);
    const rail = add(new THREE.BoxGeometry(Math.hypot(run, FLOOR_HEIGHT), 0.08, 0.08), steel, (from + to) / 2, y - FLOOR_HEIGHT / 2 + 1, fz - 0.8);
    rail.rotation.z = flight.rotation.z;
  }
  add(new THREE.BoxGeometry(fx2 - fx1, 0.15, 2.2), steel, (fx1 + fx2) / 2, H4 + 0.07, fz);

  // A rounded stone base plate under the building, with a pale path to the entrance.
  add(soft(W + 18, 1.2, D + 18, 0.6), solid("#cfcbc2"), 0, -0.6, 0);
  add(soft(W + 14, 0.2, D + 14, 0.1), solid("#e3dfd6"), 0, 0.02, 0);
  add(soft(7, 0.18, 7, 0.08), solid("#f0ebe0"), X0 - 5, 0.11, entranceZ);

  // Round clay trees around the building: a trunk and two or three soft blobs on top.
  const leafColors = ["#7cbf4a", "#6aac3d", "#8fcb57"];
  const tree = (x, z, scale) => {
    const trunk = add(new THREE.CylinderGeometry(0.35 * scale, 0.5 * scale, 3 * scale, 12), solid("#7a4d34"), x, 1.5 * scale, z);
    trunk.castShadow = true;
    add(new THREE.CylinderGeometry(1.1 * scale, 1.2 * scale, 0.35, 20), solid("#f2efe8"), x, 0.17, z);
    [[0, 4.4, 0, 2.1], [0.9, 3.7, 0.5, 1.5], [-0.8, 3.8, -0.4, 1.4]].forEach(([dx, dy, dz, r], i) => {
      const blob = add(new THREE.SphereGeometry(r * scale, 24, 18), solid(leafColors[i % 3]), x + dx * scale, dy * scale, z + dz * scale);
      blob.scale.set(1, 1.12, 1);
    });
  };
  [[X0 - 6, Z0 - 2, 1.3], [X0 - 6, D / 2 + 3, 1.1], [-X0 + 6, Z0 + 4, 1.25], [-X0 + 6, D / 2 + 4, 1.4], [0, D / 2 + 6, 1], [-X0 - 18, D / 2 + 6, 0.9]].forEach(([x, z, s]) => tree(x, z, s));

  group.userData.materials = [...materials.values()];
  return group;
}

// ---------- The route: a green trail and a glowing ball that walks it ----------
export function buildRoute(route, ballHeight = 0.6) {
  const nodes = (route?.path || []).map((id) => graphNode(id)).filter(Boolean);
  const points = [];
  for (const node of nodes) {
    const [x, z] = toWorld(node.x, node.y);
    const point = new THREE.Vector3(x, (node.floor - 1) * FLOOR_HEIGHT + ballHeight, z);
    if (!points.length || points[points.length - 1].distanceTo(point) > 0.05) points.push(point);
  }
  if (points.length < 2) return null;
  const curve = new THREE.CurvePath();
  for (let i = 0; i < points.length - 1; i += 1) curve.add(new THREE.LineCurve3(points[i], points[i + 1]));
  const group = new THREE.Group();
  const trailMaterial = new THREE.MeshBasicMaterial({ color: "#2ddf87", transparent: true, opacity: 0.7, depthTest: false });
  const trail = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(40, points.length * 10), 0.16, 8, false), trailMaterial);
  trail.renderOrder = 5;
  // The guide: the green map pin (like the 2D map's) walking the route, with a soft green glow
  // on the floor under it. Drawn on top of walls so it is never hidden.
  // transparent (at full opacity) so it is drawn after the see-through floors, on top of them.
  const ballMaterial = new THREE.MeshBasicMaterial({ color: "#1fb866", transparent: true, opacity: 1, depthTest: false });
  const haloMaterial = new THREE.MeshBasicMaterial({ color: "#2ddf87", transparent: true, opacity: 0.4, depthTest: false, side: THREE.DoubleSide });
  const dotMaterial = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 1, depthTest: false });
  const ball = new THREE.Group();
  const floorAt = -ballHeight + 0.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.15, 28, 20), ballMaterial);
  head.position.y = floorAt + 3.1;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.1, 28), ballMaterial);
  tip.rotation.x = Math.PI;
  tip.position.y = floorAt + 1.6;
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.48, 20, 14), dotMaterial);
  dot.position.set(0, floorAt + 3.15, 0);
  dot.scale.set(1, 1, 0.4);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.2, 1.5, 32), haloMaterial);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = floorAt;
  [halo, tip, head, dot].forEach((mesh, i) => { mesh.renderOrder = 10 + i; });
  ball.add(halo, tip, head, dot);
  ball.userData.dot = dot;
  const startMaterial = new THREE.MeshBasicMaterial({ color: "#3b82f6", transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide });
  const start = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.1, 32), startMaterial);
  start.rotation.x = -Math.PI / 2;
  start.position.copy(points[0]).setY(points[0].y - ballHeight + 0.25);
  start.renderOrder = 6;
  group.add(trail, start, ball);
  const floors = [...new Set(nodes.map((node) => node.floor))];
  group.userData = { curve, length: curve.getLength(), ball, halo, floors, materials: [trailMaterial, ballMaterial, haloMaterial, dotMaterial, startMaterial], ballHeight };
  return group;
}

// The 3D model is the main building only: a route into another building can't be shown in it.
export const isMainBuildingRoute = (route) => Boolean(route?.path?.length) && route.path.every((id) => {
  const node = graphNode(id);
  return !node || buildingOf(node.floor) === BUILDING_NAME;
});
