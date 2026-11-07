import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BUILDING_NAME, FLOORS, METERS_PER_UNIT as M, PLAN_HEIGHT, PLAN_WIDTH, buildingOf, graphNode } from "./floorPlans";

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
  lime: "#85c845",
  limeLight: "#76b23b",
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

// A window like the ones on the building: white frame, dark glass with a soft reflection, white
// grille bars, sometimes a curtain behind. Variant 0-3.
const windowCache = new Map();
function windowTexture(variant) {
  if (windowCache.has(variant)) return windowCache.get(variant);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  const glass = g.createLinearGradient(0, 0, 256, 128);
  glass.addColorStop(0, "#5f7380");
  glass.addColorStop(0.45, "#3e4f5a");
  glass.addColorStop(1, "#2d3a43");
  g.fillStyle = glass;
  g.fillRect(0, 0, 256, 128);
  // Curtains in some windows.
  if (variant === 1) { g.fillStyle = "rgba(236, 229, 214, .85)"; g.fillRect(14, 10, 100, 108); }
  if (variant === 2) { g.fillStyle = "rgba(214, 226, 236, .7)"; g.fillRect(14, 10, 228, 50); }
  // Sky reflection.
  g.fillStyle = "rgba(255,255,255,.16)";
  g.beginPath(); g.moveTo(30, 0); g.lineTo(90, 0); g.lineTo(40, 128); g.lineTo(-20, 128); g.fill();
  // Frame and grille.
  g.strokeStyle = "#f3f1ea";
  g.lineWidth = 12;
  g.strokeRect(6, 6, 244, 116);
  g.lineWidth = 5;
  const bars = variant === 3 ? 10 : 8;
  for (let i = 1; i < bars; i += 1) { g.beginPath(); g.moveTo((256 / bars) * i, 8); g.lineTo((256 / bars) * i, 120); g.stroke(); }
  g.beginPath(); g.moveTo(8, 64); g.lineTo(248, 64); g.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  windowCache.set(variant, texture);
  return texture;
}

// Paint that has been in the sun and rain: faint stains, streaks under the ledges, darker at the
// bottom. Light grey on white, so it only shades the wall colour a little.
let grime = null;
function grimeTexture() {
  if (grime) return grime;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 512, 256);
  let seed = 11;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 26; i += 1) {
    const x = random() * 512;
    const w = 8 + random() * 22;
    const h = 14 + random() * 46;
    const streak = g.createLinearGradient(0, 0, 0, h);
    streak.addColorStop(0, `rgba(70, 80, 60, ${0.025 + random() * 0.035})`);
    streak.addColorStop(1, "rgba(70, 80, 60, 0)");
    g.fillStyle = streak;
    g.fillRect(x, 0, w, h);
  }
  for (let i = 0; i < 60; i += 1) {
    const x = random() * 512;
    const y = random() * 256;
    const r = 6 + random() * 30;
    const spot = g.createRadialGradient(x, y, 0, x, y, r);
    spot.addColorStop(0, `rgba(80, 90, 70, ${0.02 + random() * 0.03})`);
    spot.addColorStop(1, "rgba(80, 90, 70, 0)");
    g.fillStyle = spot;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const base = g.createLinearGradient(0, 190, 0, 256);
  base.addColorStop(0, "rgba(60, 60, 45, 0)");
  base.addColorStop(1, "rgba(60, 60, 45, .14)");
  g.fillStyle = base;
  g.fillRect(0, 190, 512, 66);
  grime = new THREE.CanvasTexture(canvas);
  grime.colorSpace = THREE.SRGBColorSpace;
  grime.wrapS = THREE.RepeatWrapping;
  return grime;
}

// The painted name band across the front.
function signTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 160;
  const g = canvas.getContext("2d");
  g.fillStyle = "#97d951";
  g.fillRect(0, 0, 2048, 160);
  // Dark green border, like the painted band.
  g.strokeStyle = "#1d6b2c";
  g.lineWidth = 12;
  g.strokeRect(6, 6, 2036, 148);
  // Tall, condensed letters: dark green, outlined in yellow, as painted on the building.
  g.font = "900 118px 'Archivo Narrow', 'Arial Narrow', Archivo, Arial, sans-serif";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  const text = "SAINT SIMON OF CYRENE ACADEMY";
  const width = g.measureText(text).width;
  const room = 2048 - 220 - 40;
  g.save();
  g.translate(220, 84);
  g.scale(Math.min(1, room / width), 1.08);
  g.lineWidth = 12;
  g.strokeStyle = "#f6d23a";
  g.strokeText(text, 0, 0);
  g.fillStyle = "#16612a";
  g.fillText(text, 0, 0);
  g.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // The school's real logo (the round seal), painted in once it has loaded.
  const seal = new Image();
  seal.onload = () => {
    g.save();
    g.beginPath();
    g.arc(110, 80, 70, 0, Math.PI * 2);
    g.closePath();
    g.fillStyle = "#ffffff";
    g.fill();
    g.clip();
    g.drawImage(seal, 40, 10, 140, 140);
    g.restore();
    g.lineWidth = 5;
    g.strokeStyle = "#1d6b2c";
    g.beginPath();
    g.arc(110, 80, 70, 0, Math.PI * 2);
    g.stroke();
    texture.needsUpdate = true;
  };
  seal.src = `${import.meta.env.BASE_URL}logologooo.jpg`;
  return texture;
}

// A tarpaulin banner: a colour band, a title and a few lines, like the ones on the ground floor.
function bannerTexture(title, colors, subtitle = "") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  const gradient = g.createLinearGradient(0, 0, 512, 256);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(1, colors[1]);
  g.fillStyle = gradient;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = "rgba(255,255,255,.18)";
  for (let i = 0; i < 6; i += 1) g.fillRect(0, 150 + i * 14, 512 - i * 60, 5);
  g.fillStyle = colors[2] || "#ffffff";
  g.font = "italic 900 54px Georgia, serif";
  g.textAlign = "center";
  g.fillText(title, 256, 92);
  if (subtitle) {
    g.font = "700 30px Arial, sans-serif";
    g.fillText(subtitle, 256, 136);
  }
  g.strokeStyle = "rgba(0,0,0,.35)";
  g.lineWidth = 8;
  g.strokeRect(4, 4, 504, 248);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Steel mesh for the fire-escape railings (see-through).
let meshTexture = null;
function steelMesh() {
  if (meshTexture) return meshTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  g.strokeStyle = "#1f5a40";
  g.lineWidth = 3;
  for (let i = 0; i <= 64; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke();
  }
  meshTexture = new THREE.CanvasTexture(canvas);
  meshTexture.wrapS = THREE.RepeatWrapping;
  meshTexture.wrapT = THREE.RepeatWrapping;
  return meshTexture;
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
  // Wall paint: the colour, slightly weathered (stains and streaks), one stain pattern per ~8 m.
  const paint = (color, length) => {
    const repeats = Math.max(1, Math.round(length / 8));
    return mat(`paint${color}${repeats}`, () => {
      const map = grimeTexture().clone();
      map.repeat.set(repeats, 1);
      map.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ color, map, roughness: 0.95, metalness: 0, bumpMap: clayTexture(), bumpScale: 0.35 });
    });
  };
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
    const tall = h > 1.5; // walls get weathered paint; ledges and bands stay plain
    const mesh = add(soft(length + t, h, t, tall ? 0.1 : 0.12), tall ? paint(color, length) : solid(color), (x1 + x2) / 2, y0 + h / 2, (z1 + z2) / 2);
    mesh.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    return mesh;
  };
  const glass = mat("glass", () => new THREE.MeshStandardMaterial({ map: glassBlockTexture(), roughness: 0.55 }));
  const windowSpots = [];
  const pipesFront = [X0 + 15.5, -6, 9, -X0 - 9];
  const pipesBack = [X0 + 24, 2, -X0 - 15];
  const [bannerStart] = toWorld(4, 0);
  const bannerSpans = [[bannerStart - 1.5, bannerStart + 8], [bannerStart + 21.5, bannerStart + 24.5], [bannerStart + 29, bannerStart + 39]];
  const louvreX = X0 + 20;
  let windowSeed = 5;
  const windowRandom = () => { windowSeed = (windowSeed * 16807) % 2147483647; return windowSeed / 2147483647; };
  const windowsAlong = (x1, z1, x2, z2, y, outward, skip = () => false, blocks = false) => {
    const length = Math.hypot(x2 - x1, z2 - z1);
    const count = Math.max(1, Math.floor((length - 4) / 5.5));
    const turn = Math.atan2(outward[0], outward[1]);
    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.5 + (windowRandom() - 0.5) * 0.18) / count;
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      if (skip(x, z, y)) continue;
      if (blocks) {
        const frame = add(soft(1.9, 1.8, 0.16, 0.04), solid("#ece9df"), x + outward[0] * 0.17, y, z + outward[1] * 0.17);
        frame.rotation.y = turn;
        const pane = add(new THREE.PlaneGeometry(1.5, 1.4), glass, x + outward[0] * 0.26, y, z + outward[1] * 0.26);
        pane.rotation.y = turn;
        continue;
      }
      const w = [2.1, 2.4, 2.4, 1.7][Math.floor(windowRandom() * 4)];
      const h = 1.15;
      const front = outward[1] === 1;
      const back = outward[1] === -1;
      const level = Math.round((y - 1.75) / FLOOR_HEIGHT);
      const near = (list, gap) => list.some((px) => Math.abs(px - x) < w / 2 + gap);
      if ((front && near(pipesFront, 0.35)) || (back && near(pipesBack, 0.35))) continue;
      if (front && level <= 1 && Math.abs(x - louvreX) < w / 2 + 1.3) continue;
      if (front && level === 0 && bannerSpans.some(([a, c]) => x + w / 2 > a && x - w / 2 < c)) continue;
      windowSpots.push({ x, y, z, outward, w, along: [(x2 - x1) / length, (z2 - z1) / length] });
      const frame = add(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.1), solid("#ece9df"), x + outward[0] * 0.16, y + 0.2, z + outward[1] * 0.16);
      frame.rotation.y = turn;
      const pane = add(new THREE.PlaneGeometry(w, h), mat(`window${i % 4}`, () => new THREE.MeshStandardMaterial({ map: windowTexture(Math.floor(windowRandom() * 4)), roughness: 0.35, metalness: 0.1 })), x + outward[0] * 0.22, y + 0.2, z + outward[1] * 0.22);
      pane.rotation.y = turn;
      const sill = add(new THREE.BoxGeometry(w + 0.3, 0.1, 0.32), solid("#dcd8cc"), x + outward[0] * 0.26, y - 0.43, z + outward[1] * 0.26);
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
    windowsAlong(X0, D / 2, X0, Z0, y, [-1, 0], (x, z) => level === 0 && z > -3 && z < 9, true);
    windowsAlong(-X0, Z0, -X0, level < 3 ? D / 2 : deckZ, y, [1, 0]);
    windowsAlong(-X0, Z0, X0, Z0, y, [0, -1], (x) => x > X0 + 2 && x < X0 + 11);
  }

  // The school's name across the front, on the 3rd floor.
  const sign = add(new THREE.PlaneGeometry(signRight - signLeft, 1.8), mat("sign", () => new THREE.MeshLambertMaterial({ map: signTexture() })), (signLeft + signRight) / 2, signY, D / 2 + 0.19);
  sign.rotation.y = 0;

  // The maroon arched canopy over the side entrance, on four posts.
  const [, entranceZ] = toWorld(0, 57);
  const canopyGroup = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 11, 32, 1, true, Math.PI / 2, Math.PI), mat("canopy", () => new THREE.MeshStandardMaterial({ color: COLORS.canopy, roughness: 0.6, side: THREE.DoubleSide })));
  canopy.rotation.x = Math.PI / 2;
  canopyGroup.add(canopy);
  for (let dz = -5.4; dz <= 5.41; dz += 1.35) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(2.38, 0.035, 6, 24, Math.PI), solid("#2b2b2b"));
    rib.position.z = dz;
    canopyGroup.add(rib);
  }
  canopyGroup.scale.set(1, 0.42, 1);
  canopyGroup.position.set(X0 - 2.4, 2.35, entranceZ);
  canopyGroup.traverse((item) => { item.castShadow = true; });
  group.add(canopyGroup);
  [-5.2, 0, 5.2].forEach((dz) => add(new THREE.CylinderGeometry(0.07, 0.07, 2.35, 8), solid("#2b2b2b"), X0 - 4.75, 1.17, entranceZ + dz));
  // The entrance: a dark opening with a yellow grille gate (bars, rails and the ring pattern).
  const yellow = solid("#e8c53a");
  add(new THREE.BoxGeometry(0.06, 2.7, 4.2), solid("#22302a"), X0 - 0.17, 1.35, entranceZ);
  for (let dz = -2; dz <= 2.01; dz += 0.18) add(new THREE.BoxGeometry(0.05, 2.6, 0.05), yellow, X0 - 0.24, 1.3, entranceZ + dz);
  [0.15, 1.4, 2.6].forEach((yy) => add(new THREE.BoxGeometry(0.06, 0.07, 4.2), yellow, X0 - 0.25, yy, entranceZ));
  for (let dz = -1.8; dz <= 1.81; dz += 0.6) {
    const ring = add(new THREE.TorusGeometry(0.2, 0.03, 6, 16), yellow, X0 - 0.26, 1.85, entranceZ + dz);
    ring.rotation.y = Math.PI / 2;
  }
  // Yellow grille doors next to it, under small arches.
  [entranceZ + 4, entranceZ - 4].forEach((dz) => {
    add(new THREE.BoxGeometry(0.06, 2.2, 1.3), solid("#22302a"), X0 - 0.17, 1.1, dz);
    for (let k = -0.55; k <= 0.56; k += 0.16) add(new THREE.BoxGeometry(0.04, 2.15, 0.04), yellow, X0 - 0.23, 1.08, dz + k);
    const arch = add(new THREE.TorusGeometry(0.68, 0.08, 6, 16, Math.PI), solid("#4f9a3c"), X0 - 0.2, 2.2, dz);
    arch.rotation.y = Math.PI / 2;
  });

  // Green outdoor fire stairs at the back, zig-zagging up to the 4th floor.
  const [fx1] = toWorld(6, 0);
  const [fx2] = toWorld(26, 0);
  const fz = Z0 - 1.4;
  const steel = solid(COLORS.steel);
  const meshMaterial = mat("mesh", () => new THREE.MeshLambertMaterial({ map: steelMesh(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
  // A landing: a steel deck at each end, with a mesh railing on its three open sides and posts.
  const landing = (x, y) => {
    add(new THREE.BoxGeometry(3, 0.15, 2.4), steel, x, y + 0.07, fz);
    const front = add(new THREE.PlaneGeometry(3, 1.05), meshMaterial, x, y + 0.6, fz - 1.2);
    front.material.map.repeat.set(6, 2);
    [-1.5, 1.5].forEach((dx) => {
      const side = add(new THREE.PlaneGeometry(2.4, 1.05), meshMaterial, x + dx, y + 0.6, fz);
      side.rotation.y = Math.PI / 2;
    });
    add(new THREE.BoxGeometry(3.1, 0.07, 0.07), steel, x, y + 1.1, fz - 1.2);
    [[-1.5, -1.2], [1.5, -1.2], [-1.5, 1.1], [1.5, 1.1]].forEach(([dx, dz]) => add(new THREE.BoxGeometry(0.07, 1.1, 0.07), steel, x + dx, y + 0.55, fz + dz));
    // Legs down to the ground on the first landing.
    if (y < FLOOR_HEIGHT * 1.5) [[-1.4, -1.1], [1.4, -1.1]].forEach(([dx, dz]) => add(new THREE.BoxGeometry(0.12, y, 0.12), steel, x + dx, y / 2, fz + dz));
  };
  for (let level = 1; level <= 4; level += 1) {
    const y = level * FLOOR_HEIGHT;
    const [from, to] = level % 2 ? [fx1 + 1.5, fx2 - 1.5] : [fx2 - 1.5, fx1 + 1.5];
    const run = Math.abs(to - from);
    const angle = Math.sign(to - from) * Math.atan2(FLOOR_HEIGHT, run);
    const slope = Math.hypot(run, FLOOR_HEIGHT);
    // Open steps (a stringer on each side and treads), a handrail with posts above.
    [-0.7, 0.7].forEach((dz) => {
      const stringer = add(new THREE.BoxGeometry(slope, 0.22, 0.08), steel, (from + to) / 2, y - FLOOR_HEIGHT / 2, fz + dz);
      stringer.rotation.z = angle;
    });
    const treads = 12;
    for (let i = 0; i < treads; i += 1) {
      const t = (i + 0.5) / treads;
      add(new THREE.BoxGeometry(0.28, 0.05, 1.35), steel, from + (to - from) * t, y - FLOOR_HEIGHT + FLOOR_HEIGHT * t, fz);
    }
    const rail = add(new THREE.BoxGeometry(slope, 0.06, 0.06), steel, (from + to) / 2, y - FLOOR_HEIGHT / 2 + 1, fz - 0.75);
    rail.rotation.z = angle;
    for (let i = 1; i < 4; i += 1) {
      const t = i / 4;
      add(new THREE.BoxGeometry(0.05, 1, 0.05), steel, from + (to - from) * t, y - FLOOR_HEIGHT + FLOOR_HEIGHT * t + 0.5, fz - 0.75);
    }
    landing(level % 2 ? fx2 - 1.5 : fx1 + 1.5, y);
  }
  landing(fx1 + 1.5, FLOOR_HEIGHT * 0.02);

  // Aircon units on the walls: boxy window units under some windows, split units with a round fan.
  const unit = (x, y, z, outward, split) => {
    const turn = Math.atan2(outward[0], outward[1]);
    if (split) {
      const body = add(soft(0.9, 0.62, 0.32, 0.05), solid("#f1f1ee"), x + outward[0] * 0.4, y, z + outward[1] * 0.4);
      body.rotation.y = turn;
      const fan = add(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 20), solid("#6f7476"), x + outward[0] * 0.58 - (outward[1] ? 0.12 : 0), y, z + outward[1] * 0.58 + (outward[0] ? 0.12 : 0));
      fan.rotation.x = outward[1] ? Math.PI / 2 : 0;
      fan.rotation.z = outward[0] ? Math.PI / 2 : 0;
      add(new THREE.BoxGeometry(outward[1] ? 0.05 : 0.6, 0.05, outward[1] ? 0.6 : 0.05), solid("#9aa0a3"), x + outward[0] * 0.25, y - 0.38, z + outward[1] * 0.25);
    } else {
      const box = add(soft(0.72, 0.48, 0.55, 0.04), solid("#e8e4d8"), x + outward[0] * 0.3, y, z + outward[1] * 0.3);
      box.rotation.y = turn;
      const grille = add(new THREE.PlaneGeometry(0.6, 0.32), solid("#a9a79e"), x + outward[0] * 0.59, y, z + outward[1] * 0.59);
      grille.rotation.y = turn;
    }
  };
  // One aircon per window (as on the building), beside it: window-type units low, split units
  // a little higher; the side and type are seeded, so the building always looks the same.
  let acSeed = 23;
  const acRandom = () => { acSeed = (acSeed * 16807) % 2147483647; return acSeed / 2147483647; };
  windowSpots.forEach(({ x, y, z, outward, w, along }) => {
    const side = acRandom() < 0.5 ? -1 : 1;
    const split = acRandom() < 0.55;
    const offset = w / 2 + (split ? 0.75 : 0.62);
    const ax = x + along[0] * side * offset;
    const az = z + along[1] * side * offset;
    const pipes = outward[1] === 1 ? pipesFront : outward[1] === -1 ? pipesBack : [];
    if (pipes.some((px) => Math.abs(px - ax) < 0.7)) return;
    unit(ax, y + (split ? 0.45 : -0.05), az, outward, split);
  });

  // Tarpaulin banners on the ground floor at the front.
  const banners = [
    ["Congratulations!", ["#3a2a52", "#7a4d8c", "#f5d76e"], "Board passer"],
    ["Congratulations!", ["#5c2a2a", "#a8513d", "#ffe9a8"], "Top achiever"],
    ["Congratulations!", ["#1f3c6e", "#4f7fbf", "#ffffff"], "Licensed teacher"],
    ["NOW ACCEPTING", ["#f5c04a", "#f28c3a", "#1d4f8a"], "ENROLLEES"],
    ["CHAMPION", ["#1d6b3c", "#2fae63", "#ffffff"], "Sports fest"],
  ];
  const [b0] = toWorld(4, 0);
  banners.forEach(([title, colors, subtitle], i) => {
    const wide = i === 3;
    const w = wide ? 9 : 2.6;
    const x = wide ? b0 + 34 : b0 + i * 3.2 + (i === 4 ? 10 : 0);
    const tarp = add(new THREE.PlaneGeometry(w, 1.6), mat(`banner${i}`, () => new THREE.MeshLambertMaterial({ map: bannerTexture(title, colors, subtitle) })), x, 2.1, D / 2 + 0.34);
    tarp.castShadow = false;
  });

  // Cables fixed along the walls: under each ledge they run from hook to hook with a little sag,
  // and some drop down the wall to a unit or the ground (as in the photos).
  const cableMaterial = mat("cable", () => new THREE.MeshBasicMaterial({ color: "#222222" }));
  const cable = (points) => {
    const curve = new THREE.CatmullRomCurve3(points);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 8, 0.03, 5, false), cableMaterial));
  };
  let cableSeed = 41;
  const cableRandom = () => { cableSeed = (cableSeed * 16807) % 2147483647; return cableSeed / 2147483647; };
  const alongWall = (x1, z1, x2, z2, outward, y, gap = 0.12) => {
    const length = Math.hypot(x2 - x1, z2 - z1);
    const hooks = Math.max(2, Math.round(length / 6));
    const points = [];
    for (let i = 0; i <= hooks * 2; i += 1) {
      const t = i / (hooks * 2);
      const sag = i % 2 ? 0.25 + cableRandom() * 0.25 : 0;
      points.push(new THREE.Vector3(x1 + (x2 - x1) * t + outward[0] * gap, y - sag, z1 + (z2 - z1) * t + outward[1] * gap));
    }
    cable(points);
  };
  for (let level = 1; level <= 3; level += 1) {
    const y = level * FLOOR_HEIGHT - 0.35;
    alongWall(X0 + 1, D / 2 + 0.2, -X0 - 1, D / 2 + 0.2, [0, 1], y - (level === 3 ? 0 : 0), 0.1);
    if (level < 3) alongWall(X0 + 1, D / 2 + 0.2, -X0 - 1, D / 2 + 0.2, [0, 1], y - 0.18, 0.16);
    alongWall(-X0 - 1, Z0 - 0.2, X0 + 1, Z0 - 0.2, [0, -1], y, 0.1);
  }
  // Drops down the front and back.
  for (let i = 0; i < 9; i += 1) {
    const x = X0 + 4 + cableRandom() * (W - 8);
    const top = FLOOR_HEIGHT * (2 + Math.floor(cableRandom() * 2)) - 0.4;
    const bottom = 0.8 + cableRandom() * 2;
    const z = i % 2 ? D / 2 + 0.22 : Z0 - 0.22;
    cable([new THREE.Vector3(x, top, z), new THREE.Vector3(x + 0.25, (top + bottom) / 2, z), new THREE.Vector3(x + 0.1, bottom, z)]);
  }

  // Vertical drain pipes from the roof down to the ground.
  const pipe = solid("#7fbd45");
  [X0 + 15.5, -6, 9, -X0 - 9].forEach((x) => add(new THREE.CylinderGeometry(0.12, 0.12, H3 - 0.3, 10), pipe, x, (H3 - 0.3) / 2, D / 2 + 0.28));
  [X0 + 24, 2, -X0 - 15].forEach((x) => add(new THREE.CylinderGeometry(0.12, 0.12, H3 - 0.3, 10), pipe, x, (H3 - 0.3) / 2, Z0 - 0.28));

  // Louvre (jalousie) windows on the left part of the front: a white frame with tilted slats.
  const louvre = (x, y) => {
    add(new THREE.BoxGeometry(2.1, 1.5, 0.1), solid("#ece9df"), x, y, D / 2 + 0.17);
    add(new THREE.PlaneGeometry(1.9, 1.3), solid("#3a4650"), x, y, D / 2 + 0.2);
    for (let k = 0; k < 6; k += 1) {
      const slat = add(new THREE.BoxGeometry(1.9, 0.04, 0.2), solid("#f2f0ea"), x, y - 0.55 + k * 0.22, D / 2 + 0.3);
      slat.rotation.x = -0.6;
    }
  };
  louvre(X0 + 20, FLOOR_HEIGHT + 1.95);
  louvre(X0 + 20, 1.95);

  // Wall lamps on arms above the ground floor.
  [X0 + 10, -2, 14].forEach((x) => {
    add(new THREE.BoxGeometry(0.08, 0.08, 0.6), solid("#3b3b3b"), x, FLOOR_HEIGHT - 0.2, D / 2 + 0.45);
    add(new THREE.BoxGeometry(0.5, 0.12, 0.35), solid("#2f2f2f"), x, FLOOR_HEIGHT - 0.28, D / 2 + 0.75);
  });

  // Electric wires: concrete poles in front and behind, with black wires sagging between them
  // and a few dropping to the building.
  const wireMaterial = mat("wire", () => new THREE.MeshBasicMaterial({ color: "#1c1c1c" }));
  const pole = (x, z) => {
    add(new THREE.CylinderGeometry(0.22, 0.3, 11, 10), solid("#8f8a80"), x, 5.5, z);
    add(new THREE.BoxGeometry(2.4, 0.18, 0.18), solid("#6b665c"), x, 10.2, z);
  };
  const wire = (a, b, sag) => {
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= sag;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.035, 5, false), wireMaterial);
    group.add(tube);
  };
  const poles = [[X0 - 3, D / 2 + 4.5], [-6, D / 2 + 4.5], [-X0 + 3, D / 2 + 4.5], [X0 - 3, Z0 - 5], [-X0 + 3, Z0 - 5]];
  poles.forEach(([x, z]) => pole(x, z));
  const span = (p, q, count) => {
    for (let i = 0; i < count; i += 1) {
      const h = 9.2 + (i % 4) * 0.28;
      const off = (i % 3) * 0.35 - 0.35;
      wire(new THREE.Vector3(p[0], h, p[1] + off), new THREE.Vector3(q[0], h - 0.1, q[1] + off), 1.1 + (i % 5) * 0.35);
    }
  };
  span(poles[0], poles[1], 8);
  span(poles[1], poles[2], 8);
  span(poles[3], poles[4], 10);
  // Drops to the walls.
  [[-6, D / 2 + 4.5, -8, D / 2 + 0.3, 6.5], [-6, D / 2 + 4.5, -2, D / 2 + 0.3, 3], [X0 - 3, D / 2 + 4.5, X0 + 2, D / 2 + 0.3, 5], [X0 - 3, Z0 - 5, X0 + 6, Z0 - 0.3, 6], [-X0 + 3, Z0 - 5, -X0 - 6, Z0 - 0.3, 7]].forEach(([ax, az, bx, bz, by]) => wire(new THREE.Vector3(ax, 9.4, az), new THREE.Vector3(bx, by, bz), 0.6));

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
// Where things are in a stairwell: t runs from the entrance end (0) to the far end (1), u across
// it (0 to 1). The first flight is u < 0.5, the second u > 0.5; the half landing is t > LANDING.
export const STAIR = { FIRST: 0.1, LANDING: 0.78 };
export function stairFrame(room) {
  const [x, y, w, h] = room.rect;
  const vertical = h >= w;
  const door = room.door || [x + w / 2, y + h / 2];
  const nearStart = vertical ? door[1] - y < h / 2 : door[0] - x < w / 2;
  const along = (t) => (nearStart ? t : 1 - t);
  return {
    at: (t, u) => (vertical ? [x + w * u, y + h * along(t)] : [x + w * along(t), y + h * u]),
    length: (vertical ? h : w) * M,
    width: (vertical ? w : h) * M,
    vertical,
  };
}

// Going between floors: up (or down) the first flight to the half landing at the far end of the
// stairwell, across the landing, then the second flight back to the entrance side, one floor up.
// Straight stairs (no U shape) are one ramp across the stairwell. Plan units, floors as numbers.
function stairClimb(node, next) {
  // The flights are in the lower floor's stairwell (they rise from it to the floor above).
  const stairId = FLOORS.find((plan) => plan.floor === node.floor)?.rooms.find((item) => item.id === node.room)?.stair;
  const lower = Math.min(node.floor, next.floor);
  const room = FLOORS.find((plan) => plan.floor === lower)?.rooms.find((item) => stairId && item.stair === stairId);
  if (!room) return [];
  const { at } = stairFrame(room);
  const up = next.floor > node.floor;
  // Fraction of the climb at each point: entrance (0), the half landing (0.5), the floor above (1).
  const climb = room.shape === "u"
    ? [[STAIR.FIRST, 0.25, 0], [STAIR.LANDING, 0.25, 0.5], [(STAIR.LANDING + 1) / 2, 0.5, 0.5], [STAIR.LANDING, 0.75, 0.5], [STAIR.FIRST, 0.75, 1]]
    : [[STAIR.FIRST, 0.5, 0], [0.88, 0.5, 1]];
  const points = climb.map(([t, u, f]) => [...at(t, u), lower + f]);
  return up ? points : points.reverse();
}

export function buildRoute(route, ballHeight = 0.6) {
  const nodes = (route?.path || []).map((id) => graphNode(id)).filter(Boolean);
  const points = [];
  const push = (px, py, floorLevel) => {
    const [x, z] = toWorld(px, py);
    const point = new THREE.Vector3(x, (floorLevel - 1) * FLOOR_HEIGHT + ballHeight, z);
    if (!points.length || points[points.length - 1].distanceTo(point) > 0.05) points.push(point);
  };
  // A stairwell's own point (its middle) is left out where the route changes floor there: the
  // trail goes from the stair entrance straight onto the steps, and off them to the hallway.
  const changesFloor = (index) => {
    const node = nodes[index];
    return node.kind === "room" && [nodes[index - 1], nodes[index + 1]].some((other) => other && other.floor !== node.floor);
  };
  nodes.forEach((node, index) => {
    if (!changesFloor(index)) push(node.x, node.y, node.floor);
    const next = nodes[index + 1];
    if (next && next.floor !== node.floor && node.kind === "room") stairClimb(node, next).forEach(([px, py, level]) => push(px, py, level));
  });
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
