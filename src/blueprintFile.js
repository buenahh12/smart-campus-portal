// Turns the file an engineer or contractor sends into a picture for the blueprint editor:
// a photo or scan (JPG, PNG…), a PDF (its first page), or a CAD drawing saved as DXF.
// DWG, AutoCAD's own format, is closed; ask for "Save As → DXF" or a PDF instead.

export const BLUEPRINT_ACCEPT = "image/*,.pdf,application/pdf,.dxf,image/vnd.dxf,application/dxf";

const extension = (file) => (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();

// Something drawImage can use, with its width and height.
export async function blueprintPicture(file) {
  const type = extension(file);
  if (type === "dwg") throw new Error("DWG files can't be opened in a browser. Ask the engineer to send it as DXF (in AutoCAD: Save As → DXF) or as a PDF.");
  if (type === "pdf" || file.type === "application/pdf") return pdfPicture(file);
  if (type === "dxf") return dxfPicture(await file.text());
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error("That file could not be opened. Use a picture (JPG or PNG), a PDF, or a CAD drawing saved as DXF.");
  }
}

// ---------- PDF: the first page, drawn about 2400 pixels wide ----------
async function pdfPicture(file) {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await loading.promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(4, 2400 / Math.max(base.width, base.height)) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, canvas, viewport }).promise;
    return canvas;
  } finally {
    loading.destroy();
  }
}

// ---------- DXF: lines, polylines, arcs, circles and text, including blocks (doors, symbols) ----------
// A DXF file is pairs of lines: a group code, then its value.
function readPairs(text) {
  const lines = text.split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number.parseInt(lines[i], 10), lines[i + 1].trim()]);
  return pairs;
}

// Entities as { type, codes: [[code, value], …] }, split into the BLOCKS and ENTITIES sections.
function readDxf(text) {
  const pairs = readPairs(text);
  const blocks = new Map();
  const entities = [];
  let section = "";
  let block = null;
  let current = null;
  const finish = () => {
    if (!current) return;
    if (current.type === "BLOCK") block = { name: current.get(2), base: [current.num(10), current.num(20)], items: [] };
    else if (current.type === "ENDBLK") {
      if (block) blocks.set(block.name, { ...block, items: joinPolylines(block.items) });
      block = null;
    } else if (section === "BLOCKS" && block) block.items.push(current);
    else if (section === "ENTITIES") entities.push(current);
    current = null;
  };
  for (let i = 0; i < pairs.length; i += 1) {
    const [code, value] = pairs[i];
    if (code === 0) {
      finish();
      if (value === "SECTION") {
        section = pairs[i + 1]?.[0] === 2 ? pairs[i + 1][1] : "";
        continue;
      }
      if (value === "ENDSEC") {
        section = "";
        continue;
      }
      if (section === "BLOCKS" || section === "ENTITIES") current = entity(value);
    } else if (current) current.codes.push([code, value]);
  }
  finish();
  return { blocks, entities: joinPolylines(entities) };
}

function entity(type) {
  const codes = [];
  return {
    type,
    codes,
    get: (code) => codes.find(([c]) => c === code)?.[1],
    num: (code, fallback = 0) => {
      const value = Number.parseFloat(codes.find(([c]) => c === code)?.[1]);
      return Number.isFinite(value) ? value : fallback;
    },
  };
}

// Old-style POLYLINE + VERTEX … SEQEND becomes one entity with its points.
function joinPolylines(list) {
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (item.type !== "POLYLINE") {
      if (item.type !== "VERTEX" && item.type !== "SEQEND") out.push(item);
      continue;
    }
    item.points = [];
    while (list[i + 1]?.type === "VERTEX") {
      i += 1;
      item.points.push([list[i].num(10), list[i].num(20)]);
    }
    out.push(item);
  }
  return out;
}

const SKIP_LAYERS = /^(defpoints|.*dim.*|.*hatch.*)$/i;
const arcPoints = (cx, cy, r, from, to) => {
  let sweep = to - from;
  while (sweep <= 0) sweep += 360;
  const steps = Math.max(6, Math.ceil(sweep / 10));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = ((from + (sweep * i) / steps) * Math.PI) / 180;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });
};
const cleanMtext = (value) => value.replace(/\\P/g, " ").replace(/\{\\[^;]*;|\}|\{/g, "").replace(/\\[A-Za-z][^;]*;/g, "").trim();

// Every line (as point lists) and label in drawing coordinates, with blocks placed where inserted.
function shapesOf(items, blocks, transform, depth, out) {
  for (const item of items) {
    if (out.paths.length > 200000) return;
    if (SKIP_LAYERS.test(item.get(8) || "")) continue;
    const at = (x, y) => transform([x, y]);
    switch (item.type) {
      case "LINE":
        out.paths.push([at(item.num(10), item.num(20)), at(item.num(11), item.num(21))]);
        break;
      case "LWPOLYLINE": {
        const xs = item.codes.filter(([c]) => c === 10).map(([, v]) => Number.parseFloat(v));
        const ys = item.codes.filter(([c]) => c === 20).map(([, v]) => Number.parseFloat(v));
        const points = xs.map((x, i) => at(x, ys[i]));
        if (item.num(70) & 1) points.push(points[0]);
        if (points.length > 1) out.paths.push(points);
        break;
      }
      case "POLYLINE": {
        const points = item.points.map(([x, y]) => at(x, y));
        if (item.num(70) & 1) points.push(points[0]);
        if (points.length > 1) out.paths.push(points);
        break;
      }
      case "CIRCLE":
        out.paths.push(arcPoints(item.num(10), item.num(20), item.num(40), 0, 360).map(([x, y]) => at(x, y)));
        break;
      case "ARC":
        out.paths.push(arcPoints(item.num(10), item.num(20), item.num(40), item.num(50), item.num(51)).map(([x, y]) => at(x, y)));
        break;
      case "TEXT":
      case "MTEXT": {
        const raw = item.type === "MTEXT" ? item.codes.filter(([c]) => c === 3 || c === 1).map(([, v]) => v).join("") : item.get(1) || "";
        const text = cleanMtext(raw);
        const corner = at(item.num(10), item.num(20));
        const top = at(item.num(10), item.num(20) + item.num(40, 1));
        if (text) out.texts.push({ text, at: corner, size: Math.hypot(top[0] - corner[0], top[1] - corner[1]) });
        break;
      }
      case "INSERT": {
        const block = blocks.get(item.get(2));
        if (!block || depth > 4) break;
        const sx = item.num(41, 1);
        const sy = item.num(42, 1);
        const turn = (item.num(50) * Math.PI) / 180;
        const [ix, iy] = [item.num(10), item.num(20)];
        const [bx, by] = block.base;
        const inner = ([x, y]) => {
          const dx = (x - bx) * sx;
          const dy = (y - by) * sy;
          return transform([ix + dx * Math.cos(turn) - dy * Math.sin(turn), iy + dx * Math.sin(turn) + dy * Math.cos(turn)]);
        };
        shapesOf(block.items, blocks, inner, depth + 1, out);
        break;
      }
      default:
        break;
    }
  }
}

export function dxfPicture(text) {
  const { blocks, entities } = readDxf(text);
  const out = { paths: [], texts: [] };
  shapesOf(entities, blocks, (point) => point, 0, out);
  const points = out.paths.flat().filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (points.length < 2) throw new Error("No drawing was found in this DXF file. Check that the floor plan is in model space, or send a PDF instead.");
  // Bounds without the farthest 0.5% of points, so a stray mark far away doesn't shrink the plan.
  const sorted = (axis) => points.map((point) => point[axis]).sort((a, b) => a - b);
  const xs = sorted(0);
  const ys = sorted(1);
  const cut = Math.floor(points.length * 0.005);
  const [minX, maxX, minY, maxY] = [xs[cut], xs[xs.length - 1 - cut], ys[cut], ys[ys.length - 1 - cut]];
  const width = Math.max(maxX - minX, 1e-6);
  const height = Math.max(maxY - minY, 1e-6);
  const scale = 2300 / Math.max(width, height);
  const pad = 50;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale + pad * 2);
  canvas.height = Math.round(height * scale + pad * 2);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  // CAD y goes up; pictures go down.
  const px = ([x, y]) => [pad + (x - minX) * scale, pad + (maxY - y) * scale];
  context.strokeStyle = "#1f2937";
  context.lineWidth = 2;
  context.lineJoin = "round";
  context.beginPath();
  for (const path of out.paths) {
    path.forEach((point, i) => {
      const [x, y] = px(point);
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
  }
  context.stroke();
  context.fillStyle = "#111827";
  context.textBaseline = "bottom";
  for (const label of out.texts.slice(0, 2000)) {
    const size = Math.min(60, Math.max(12, label.size * scale));
    context.font = `${size}px sans-serif`;
    const [x, y] = px(label.at);
    context.fillText(label.text.slice(0, 60), x, y);
  }
  return canvas;
}
