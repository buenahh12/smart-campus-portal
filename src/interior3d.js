import * as THREE from "three";

// Inside the 3D building, like an architect's model: wood-plank floors in rooms, light tiles in
// hallways and comfort rooms, and simple furniture so each kind of room is easy to recognise.
// Furniture is drawn with instanced meshes (one draw per shape and colour per floor) to stay fast.

const cache = new Map();
function canvasTexture(key, draw) {
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  draw(canvas.getContext("2d"));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  cache.set(key, texture);
  return texture;
}

// Warm wood planks (one texture repeat = 2 m).
export const woodTexture = () => canvasTexture("wood", (g) => {
  const tones = ["#c8955c", "#bf8a51", "#d09f67", "#c38f57", "#b98349"];
  for (let row = 0; row < 8; row += 1) {
    const offset = (row % 2) * 96;
    for (let col = -1; col < 3; col += 1) {
      g.fillStyle = tones[(row * 3 + col + 5) % tones.length];
      g.fillRect(col * 128 + offset, row * 32, 128, 32);
      g.fillStyle = "rgba(90, 55, 25, .35)";
      g.fillRect(col * 128 + offset, row * 32, 2, 32);
    }
    g.fillStyle = "rgba(90, 55, 25, .3)";
    g.fillRect(0, row * 32, 256, 1.5);
    for (let k = 0; k < 6; k += 1) {
      g.strokeStyle = "rgba(120, 75, 35, .18)";
      g.beginPath();
      const y = row * 32 + 6 + k * 4;
      g.moveTo(0, y);
      g.bezierCurveTo(80, y + 2, 170, y - 2, 256, y + 1);
      g.stroke();
    }
  }
});

// Light square tiles with grout lines (one repeat = 2 m, so 50 cm tiles).
export const tileTexture = (tint = "#e9e6df") => canvasTexture(`tile${tint}`, (g) => {
  g.fillStyle = "#c9c4b8";
  g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      g.fillStyle = tint;
      g.fillRect(col * 64 + 2, row * 64 + 2, 60, 60);
      g.fillStyle = "rgba(255, 255, 255, .25)";
      g.fillRect(col * 64 + 4, row * 64 + 4, 28, 3);
    }
  }
});

// Makes a box's texture repeat by size (metres), so planks and tiles stay the same size everywhere.
export function scaleUv(geometry, width, depth, metresPerRepeat = 2) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * (width / metresPerRepeat), uv.getY(i) * (depth / metresPerRepeat));
  uv.needsUpdate = true;
  return geometry;
}

const FURNITURE = {
  wood: "#b98450",
  woodLight: "#d4ab78",
  chair: "#4f8f5e",
  board: "#2f5a3d",
  metal: "#9aa3a6",
  shelf: "#8a5b36",
  book: ["#c0392b", "#2e86c1", "#f1c40f", "#27ae60", "#8e44ad"],
  stall: "#7fb3c8",
  sink: "#f2f4f4",
  cabinet: "#cfc6b4",
  bench: "#e8ecef",
};

// Furniture for one floor. toWorld(x, y) turns plan units into world x, z; M = metres per unit.
export function furnishFloor(plan, toWorld, M, materialFor, slabTop) {
  const pieces = new Map(); // "w,h,d|color" -> list of [x, y, z, rotation]
  const put = (w, h, d, color, x, z, y = 0, turn = 0) => {
    const key = `${w.toFixed(2)},${h.toFixed(2)},${d.toFixed(2)}|${color}`;
    if (!pieces.has(key)) pieces.set(key, []);
    pieces.get(key).push([x, slabTop + y + h / 2, z, turn]);
  };
  for (const room of plan.rooms) {
    if (!room.door || ["stairs", "exit", "void", "deck"].includes(room.type)) continue;
    const [px, py, pw, ph] = room.rect;
    const [x0, z0] = toWorld(px, py);
    const width = pw * M;
    const depth = ph * M;
    if (width < 2.4 || depth < 2.4) continue;
    const name = (room.name || "").toLowerCase();
    const wide = width >= depth;
    const along = (a, b) => (wide ? [x0 + a, z0 + b] : [x0 + b, z0 + a]);
    const long = wide ? width : depth;
    const short = wide ? depth : width;

    if (room.type === "classroom") {
      // Green board on one short wall, teacher's table in front of it, rows of desks and chairs.
      const [bx, bz] = along(0.2, short / 2);
      put(wide ? 0.08 : Math.min(3.2, short - 1), 1.1, wide ? Math.min(3.2, short - 1) : 0.08, FURNITURE.board, bx, bz, 0.9);
      const [tx, tz] = along(1.4, short / 2);
      put(wide ? 0.7 : 1.4, 0.75, wide ? 1.4 : 0.7, FURNITURE.wood, tx, tz);
      const rows = Math.max(1, Math.floor((long - 3.2) / 1.25));
      const cols = Math.max(1, Math.floor((short - 1.2) / 1.05));
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const a = 3 + r * 1.25;
          const b = (short - (cols - 1) * 1.05) / 2 + c * 1.05;
          const [cx, cz] = along(a, b);
          put(wide ? 0.45 : 0.6, 0.72, wide ? 0.6 : 0.45, FURNITURE.woodLight, cx, cz);
          const [sx, sz] = along(a + 0.5, b);
          put(0.42, 0.45, 0.42, FURNITURE.chair, sx, sz);
        }
      }
    } else if (room.type === "office") {
      const [cx, cz] = along(long / 2, short / 2);
      put(wide ? 1.4 : 0.75, 0.75, wide ? 0.75 : 1.4, FURNITURE.wood, cx, cz);
      const [sx, sz] = along(long / 2, short / 2 + 0.75);
      put(0.48, 0.5, 0.48, FURNITURE.chair, sx, sz);
      for (let i = 0; i < Math.min(3, Math.floor(long / 1.5)); i += 1) {
        const [kx, kz] = along(0.6 + i * 1.1, 0.35);
        put(wide ? 0.9 : 0.5, 1.5, wide ? 0.5 : 0.9, FURNITURE.cabinet, kx, kz);
      }
      if (short > 3.5) {
        const [gx, gz] = along(long - 1.2, short - 1.1);
        put(1.2, 0.45, 1.2, FURNITURE.woodLight, gx, gz);
      }
    } else if (room.type === "cr") {
      // A row of stalls along one long wall, sinks along the other.
      const stalls = Math.max(1, Math.floor((long - 0.6) / 1.1));
      for (let i = 0; i < stalls; i += 1) {
        const [wx, wz] = along(0.6 + i * 1.1, 0.75);
        put(wide ? 0.06 : 1.5, 1.8, wide ? 1.5 : 0.06, FURNITURE.stall, wx, wz);
        const [tx, tz] = along(1.15 + i * 1.1, 0.5);
        put(0.45, 0.42, 0.55, FURNITURE.sink, tx, tz);
      }
      if (short > 2.6) {
        for (let i = 0; i < Math.min(3, stalls); i += 1) {
          const [sx, sz] = along(1 + i * 1.1, short - 0.35);
          put(0.55, 0.85, 0.45, FURNITURE.sink, sx, sz);
        }
      }
    } else if (name.includes("library")) {
      // Shelves with books along the long walls, reading tables in the middle.
      const shelves = Math.max(1, Math.floor((long - 1) / 1.6));
      for (let i = 0; i < shelves; i += 1) {
        for (const side of [0.3, short - 0.3]) {
          const [sx, sz] = along(0.9 + i * 1.6, side);
          put(wide ? 1.4 : 0.4, 2, wide ? 0.4 : 1.4, FURNITURE.shelf, sx, sz);
          for (let k = 0; k < 3; k += 1) {
            const [bx, bz] = along(0.9 + i * 1.6, side);
            put(wide ? 1.25 : 0.3, 0.32, wide ? 0.3 : 1.25, FURNITURE.book[(i + k) % FURNITURE.book.length], bx, bz, 0.35 + k * 0.6);
          }
        }
      }
      const tables = Math.max(1, Math.floor((long - 2) / 2.6));
      for (let i = 0; i < tables; i += 1) {
        const [tx, tz] = along(1.8 + i * 2.6, short / 2);
        put(wide ? 1.8 : 1, 0.75, wide ? 1 : 1.8, FURNITURE.wood, tx, tz);
        for (const off of [-0.8, 0.8]) {
          const [cx, cz] = along(1.8 + i * 2.6, short / 2 + off);
          put(0.42, 0.45, 0.42, FURNITURE.chair, cx, cz);
        }
      }
    } else if (room.type === "lab" || name.includes("computer")) {
      // Long benches with stools (computers on the benches in the computer room).
      const benches = Math.max(1, Math.floor((short - 1) / 1.8));
      for (let i = 0; i < benches; i += 1) {
        const b = 1.1 + i * 1.8;
        const [bx, bz] = along(long / 2, b);
        put(wide ? long - 2 : 0.8, 0.85, wide ? 0.8 : long - 2, FURNITURE.bench, bx, bz);
        const seats = Math.max(1, Math.floor((long - 2) / 1.2));
        for (let s = 0; s < seats; s += 1) {
          const a = 1.6 + s * 1.2;
          const [sx, sz] = along(a, b + 0.7);
          put(0.35, 0.55, 0.35, FURNITURE.chair, sx, sz);
          if (name.includes("computer")) {
            const [mx, mz] = along(a, b - 0.15);
            put(wide ? 0.5 : 0.08, 0.35, wide ? 0.08 : 0.5, "#2b2f33", mx, mz, 0.85);
          }
        }
      }
    } else {
      // Other rooms (TVL, video, audio visual…): a few big tables with chairs.
      const tables = Math.max(1, Math.floor((long - 1.5) / 2.8));
      for (let i = 0; i < tables; i += 1) {
        const [tx, tz] = along(1.6 + i * 2.8, short / 2);
        put(1.6, 0.78, 1.6, FURNITURE.woodLight, tx, tz);
        for (const [oa, ob] of [[-1.1, 0], [1.1, 0], [0, -1.1], [0, 1.1]]) {
          const [cx, cz] = along(1.6 + i * 2.8 + oa, short / 2 + ob);
          put(0.42, 0.45, 0.42, FURNITURE.chair, cx, cz);
        }
      }
    }
  }
  const group = new THREE.Group();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  for (const [key, list] of pieces) {
    const [size, color] = key.split("|");
    const [w, h, d] = size.split(",").map(Number);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(w, h, d), materialFor(color), list.length);
    list.forEach(([x, y, z, turn], index) => {
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn);
      matrix.compose(new THREE.Vector3(x, y, z), quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    group.add(mesh);
  }
  return group;
}
