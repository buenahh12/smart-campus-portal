import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { CMS_COLLECTIONS, deleteItem, readItem, setItem, watchCollection } from "./cms";
import { auth } from "./firebase";
import { BUILDING_NAME, FLOORS, PLACES, PLAN_HEIGHT, PLAN_WIDTH, ROOM_TYPES, buildGraph, floorLabel, normalizeFloor, placeTitle } from "./floorPlans";
import { usePlanVersion } from "./usePlan";
import "./analytics.css";
import "./adminplan.css";

// Content manager → Floor plan → Add floors. When a contractor sends the blueprint of a new floor
// or building, the administrator uploads it here, draws (or asks the AI to draft) the rooms,
// hallways, stairs and doors on top, checks that it connects to the rest of the school, and
// publishes it. The new floor then appears on the 2D map, in routes, search, SiBot, the
// directory and AR. Saved in planFloors (the floor) and planBlueprints (the picture, admin only).

const AI_ENDPOINT = import.meta.env.VITE_BLUEPRINT_ENDPOINT || "https://smart-campus-portal-one.vercel.app/api/blueprint-draft";
const TYPE_LABELS = { classroom: "Classroom", office: "Office", lab: "Laboratory", facility: "Facility", cr: "Comfort room", stairs: "Stairs", exit: "Exit / entrance" };
const TOOLS = [
  { id: "select", label: "Select", hint: "Tap a room or hallway to edit it." },
  { id: "room", label: "Room", hint: "Drag on the blueprint to draw a room." },
  { id: "hall", label: "Hallway", hint: "Drag to draw a hallway. Hallways that touch are joined for routes." },
  { id: "stairs", label: "Stairs", hint: "Drag to draw a stairwell, then choose which stairs it is." },
  { id: "door", label: "Door", hint: "Tap a room's wall where its door opens into the hallway." },
];
const snap = (value) => Math.round(value * 2) / 2;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// A new id that is not used yet on this floor ("room-3", "hall-2", …).
const nextId = (prefix, items) => {
  let n = items.length + 1;
  while (items.some((item) => item.id === `${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
};

// The point on a rectangle's edge closest to p (where a door goes).
function nearestEdgePoint([x, y, w, h], p) {
  const options = [
    [clamp(p.x, x, x + w), y], [clamp(p.x, x, x + w), y + h],
    [x, clamp(p.y, y, y + h)], [x + w, clamp(p.y, y, y + h)],
  ];
  return options.reduce((best, point) => (Math.hypot(point[0] - p.x, point[1] - p.y) < Math.hypot(best[0] - p.x, best[1] - p.y) ? point : best)).map(snap);
}

// The uploaded blueprint, fitted into a 1600 x 1000 picture (the plan's 160 x 100 shape) on
// white, as a JPEG small enough to save (under about 850 KB).
async function fitBlueprint(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1000;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  context.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  for (const quality of [0.8, 0.65, 0.5, 0.4]) {
    const data = canvas.toDataURL("image/jpeg", quality);
    if (data.length < 850000) return data;
  }
  throw new Error("This blueprint picture is too detailed to save. Crop it or use a smaller scan.");
}

const emptyFloor = (fields) => ({ rooms: [], halls: [], links: [], label: "", published: false, ...fields });

export default function AdminBlueprint() {
  usePlanVersion();
  const [docs, setDocs] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState(null);
  const [image, setImage] = useState("");
  const [imageChanged, setImageChanged] = useState(false);
  const [tool, setTool] = useState("select");
  const [selected, setSelected] = useState(null); // { kind: "rooms" | "halls", index }
  const [drag, setDrag] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(null);
  const svgRef = useRef(null);

  useEffect(() => watchCollection(CMS_COLLECTIONS.planFloors, setDocs, () => setLoadError("Added floors could not be loaded. Check your connection and that you are signed in as the administrator.")), []);

  // Buildings: the main one plus every building an added floor belongs to.
  const buildings = useMemo(() => [...new Set([BUILDING_NAME, ...docs.map((item) => item.building).filter(Boolean)])], [docs]);

  // ---------- Starting a floor ----------
  const startNew = () => {
    setCreating({ building: BUILDING_NAME, newBuilding: "", level: "" });
    setError("");
    setNotice("");
  };

  const createFloor = (event) => {
    event.preventDefault();
    const building = (creating.building === "__new" ? creating.newBuilding : creating.building).trim();
    const level = Math.round(Number(creating.level));
    if (!building) return setError("Type the name of the new building, for example \"Science Annex\".");
    if (!Number.isFinite(level) || level < 1 || level > 20) return setError("Choose a floor number from 1 (ground floor) to 20.");
    const used = [...FLOORS.filter((plan) => !plan.added), ...docs].some((item) => item.building === building && Number(item.level) === level);
    if (used) return setError(`${building} already has that floor. Edit it from the list instead.`);
    let floor;
    if (building === BUILDING_NAME) {
      if (level <= 4) return setError("The main building's ground to 4th floors are already on the map. Add the 5th floor or higher.");
      floor = level;
    } else {
      // Each other building gets its own hundred: 101, 102 … for the first, 201 … for the next.
      const existing = docs.find((item) => item.building === building && Number(item.floor) > 100);
      const hundred = existing ? Math.floor(Number(existing.floor) / 100) : Math.max(0, ...docs.map((item) => Math.floor(Number(item.floor) / 100))) + 1;
      floor = hundred * 100 + level;
    }
    const id = `floor-${floor}`;
    setDraft(emptyFloor({ id, floor, level, building }));
    setImage("");
    setImageChanged(false);
    setCreating(null);
    setSelected(null);
    setTool("select");
    setError("");
    setNotice("New floor started. Upload its blueprint, then draw the rooms and hallways on top.");
  };

  const openFloor = async (item) => {
    setDraft(emptyFloor({ ...item, rooms: item.rooms || [], halls: item.halls || [], links: item.links || [] }));
    setSelected(null);
    setTool("select");
    setError("");
    setNotice("");
    setImage("");
    setImageChanged(false);
    try {
      setImage((await readItem(CMS_COLLECTIONS.planBlueprints, item.id))?.image || "");
    } catch {
      setNotice("The blueprint picture could not be loaded; the rooms are still here.");
    }
  };

  // ---------- Editing ----------
  const update = (changes) => setDraft((current) => ({ ...current, ...changes }));
  const updateItem = (kind, index, changes) => setDraft((current) => ({ ...current, [kind]: current[kind].map((item, i) => (i === index ? { ...item, ...changes } : item)) }));
  const pick = (item) => {
    setSelected(item);
    setNotice("");
  };
  const removeItem = (kind, index) => {
    setDraft((current) => ({ ...current, [kind]: current[kind].filter((_, i) => i !== index) }));
    setSelected(null);
  };

  const toPlan = (event) => {
    const point = svgRef.current.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const { x, y } = point.matrixTransform(svgRef.current.getScreenCTM().inverse());
    return { x: snap(clamp(x, 0, PLAN_WIDTH)), y: snap(clamp(y, 0, PLAN_HEIGHT)) };
  };

  const onPointerDown = (event) => {
    if (!draft || event.button > 0) return;
    const p = toPlan(event);
    if (tool === "door") {
      // The room under the tap (or whose wall is within 2 units of it).
      const index = draft.rooms.findIndex(({ rect: [x, y, w, h] }) => p.x >= x - 2 && p.x <= x + w + 2 && p.y >= y - 2 && p.y <= y + h + 2);
      if (index === -1) return setNotice("Tap on or next to a room's wall to place its door.");
      updateItem("rooms", index, { door: nearestEdgePoint(draft.rooms[index].rect, p) });
      setSelected({ kind: "rooms", index });
      return;
    }
    if (tool === "select") return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ start: p, end: p });
  };
  const onPointerMove = (event) => drag && setDrag({ ...drag, end: toPlan(event) });
  const onPointerUp = () => {
    if (!drag) return;
    const x = Math.min(drag.start.x, drag.end.x);
    const y = Math.min(drag.start.y, drag.end.y);
    const w = Math.abs(drag.end.x - drag.start.x);
    const h = Math.abs(drag.end.y - drag.start.y);
    setDrag(null);
    if (w < 2 || h < 2) return;
    const rect = [x, y, w, h];
    if (tool === "hall") {
      const halls = [...draft.halls, { id: nextId("hall", draft.halls), name: `Hallway ${draft.halls.length + 1}`, rect }];
      update({ halls });
      setSelected({ kind: "halls", index: halls.length - 1 });
    } else {
      const stairs = tool === "stairs";
      const rooms = [...draft.rooms, { id: nextId(stairs ? "stairs" : "room", draft.rooms), name: stairs ? "Stairs" : `Room ${draft.rooms.length + 1}`, code: "", type: stairs ? "stairs" : "classroom", rect, door: null, stair: "" }];
      update({ rooms });
      setSelected({ kind: "rooms", index: rooms.length - 1 });
      setNotice(stairs ? "Choose which stairs this is on the right, then use Door to mark where you enter them." : "Name the room on the right, then use Door to tap the wall where its door is.");
    }
  };

  // ---------- Blueprint picture and AI draft ----------
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try {
      setBusy("Preparing the blueprint…");
      setImage(await fitBlueprint(file));
      setImageChanged(true);
      setNotice("Blueprint added. Draw over it, or try Generate with AI.");
    } catch (problem) {
      setError(problem.message || "That file could not be opened as a picture. Use a JPG or PNG; export a PDF page as an image first.");
    } finally {
      setBusy("");
    }
  };

  // Puts a traced plan (from the AI, or a file) on this floor: rooms, hallways and walkways.
  const applyTrace = (result) => {
    const rooms = (result.rooms || []).map((item, index) => ({ id: item.id || `${item.type === "stairs" ? "stairs" : "room"}-${index + 1}`, name: item.name || "Room", code: item.code || "", type: ROOM_TYPES.includes(item.type) ? item.type : "classroom", rect: item.rect, door: item.door, stair: item.stair || "" }));
    const halls = (result.halls || []).map((item, index) => ({ id: item.id || `hall-${index + 1}`, name: item.name || `Hallway ${index + 1}`, rect: item.rect }));
    // Through normalizeFloor so every rectangle and door is inside the plan.
    const clean = normalizeFloor({ ...draft, rooms, halls, links: result.links || draft.links });
    update({ rooms: clean.rooms.map((item, index) => ({ ...item, stair: item.stair || rooms[index].stair })), halls: clean.halls, links: clean.links });
    setSelected(null);
    return clean;
  };

  // A traced plan saved as a .json file: { rooms: [{ name, code, type, rect, door }], halls: [{ name, rect }], links }.
  const importTrace = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try {
      const result = JSON.parse(await file.text());
      if (!Array.isArray(result.rooms) || !Array.isArray(result.halls)) throw new Error();
      if ((draft.rooms.length || draft.halls.length) && !window.confirm("Replace the rooms and hallways on this floor with the imported plan?")) return;
      const clean = applyTrace(result);
      setNotice(`Imported ${clean.rooms.length} rooms, ${clean.halls.length} hallways and ${clean.links.length} walkways. Check them against the blueprint, then publish.`);
    } catch {
      setError("That file is not a traced floor plan. Use the .json file made for this editor.");
    }
  };

  const generate = async () => {
    if (!image) return setError("Upload the blueprint first.");
    if ((draft.rooms.length || draft.halls.length) && !window.confirm("Replace the rooms and hallways on this floor with the AI's draft?")) return;
    setError("");
    setNotice("");
    setBusy("The AI is reading the blueprint. This can take up to a minute…");
    try {
      const idToken = await auth?.currentUser?.getIdToken();
      const response = await fetch(AI_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ image }) });
      const result = await response.json().catch(() => ({}));
      if (result.error === "nokey") throw new Error("The AI draft is not set up yet (ANTHROPIC_API_KEY in Vercel). You can still trace the blueprint by hand.");
      if (!response.ok) throw new Error(result.error || "The AI could not read this blueprint. Trace it by hand instead.");
      const clean = applyTrace(result);
      setNotice(`Draft ready: ${clean.rooms.length} rooms and ${clean.halls.length} hallways. Check every room, name the stairs, and fix doors before publishing.${result.notes ? ` AI note: ${result.notes}` : ""}`);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy("");
    }
  };

  // ---------- Checks: does this floor connect to the rest of the school? ----------
  const plan = useMemo(() => (draft ? normalizeFloor(draft) : null), [draft]);
  const checks = useMemo(() => {
    if (!plan) return null;
    const others = FLOORS.filter((item) => item.floor !== plan.floor);
    const graph = buildGraph([...others, plan]);
    const onFloor = (id) => id.startsWith(`${plan.floor}:`);
    // Everything on this floor reachable from another floor.
    const seen = new Set();
    const queue = [...graph.nodes.keys()].filter((id) => !onFloor(id));
    queue.forEach((id) => seen.add(id));
    while (queue.length) {
      const id = queue.shift();
      for (const edge of graph.edges.get(id) || []) {
        if (!seen.has(edge.to)) {
          seen.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
    const connected = plan.rooms.some((item) => item.door && seen.has(`${plan.floor}:${item.id}`));
    const noDoor = plan.rooms.filter((item) => !item.door);
    const unreachable = plan.rooms.filter((item) => item.door && !seen.has(`${plan.floor}:${item.id}`));
    const stairs = plan.rooms.filter((item) => item.type === "stairs").map((item) => {
      const neighbours = FLOORS.filter((other) => other.building === plan.building && Math.abs(other.level - plan.level) === 1 && other.rooms.some((room) => room.stair && room.stair === item.stair));
      return { item, neighbours };
    });
    return { connected, noDoor, unreachable, stairs };
  }, [plan]);

  // Stairs this one can join: stairs on the floors just above and below in the same building.
  const stairOptions = useMemo(() => {
    if (!draft) return [];
    const options = new Map();
    for (const other of FLOORS) {
      if (other.building !== draft.building || Math.abs(other.level - draft.level) !== 1) continue;
      for (const item of other.rooms) if (item.stair) options.set(item.stair, `${item.name.replace(/ \(.*\)/, "")} (${floorLabel(other.floor)})`);
    }
    return [...options];
  }, [draft]);

  const linkTargets = useMemo(() => (draft ? PLACES.filter((item) => item.floor !== draft.floor && item.type !== "stairs").sort((a, b) => a.floor - b.floor) : []), [draft]);

  // ---------- Saving ----------
  const save = async (publish) => {
    setError("");
    setNotice("");
    if (publish && plan.rooms.length === 0) return setError("Add at least one room before publishing.");
    if (publish && !checks.connected) return setError("This floor is not connected to the rest of the school yet. Add stairs with the same name as stairs on the floor next to it, or a walkway link, before publishing.");
    setBusy(publish ? "Publishing…" : "Saving draft…");
    try {
      const record = {
        floor: plan.floor,
        level: plan.level,
        building: plan.building,
        label: String(draft.label || "").slice(0, 60),
        rooms: plan.rooms.map(({ id, name, code, type, rect, door, stair }) => ({ id, name, code, type, rect, door: door || null, ...(stair ? { stair } : {}) })),
        halls: plan.halls.map(({ id, name, rect }) => ({ id, name, rect })),
        links: plan.links,
        published: Boolean(publish),
      };
      await setItem(CMS_COLLECTIONS.planFloors, draft.id, record);
      if (imageChanged && image) {
        await setItem(CMS_COLLECTIONS.planBlueprints, draft.id, { image });
        setImageChanged(false);
      }
      update({ published: Boolean(publish) });
      setNotice(publish ? `${plan.building}, ${plan.level === 1 ? "ground floor" : `floor ${plan.level}`} is published. It is on the floor plan, in routes, search, SiBot and AR now.` : "Draft saved. Only you can see it until you publish.");
    } catch (problem) {
      setError(problem?.code === "permission-denied" ? "Permission denied. Only the administrator can change the floor plan (and the database rules must be deployed)." : problem?.message || "The floor could not be saved. Try again.");
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete this floor (${draft.building}, ${draft.level === 1 ? "ground floor" : `floor ${draft.level}`})? It will disappear from the map. This cannot be undone.`)) return;
    setBusy("Deleting…");
    try {
      await deleteItem(CMS_COLLECTIONS.planFloors, draft.id);
      await deleteItem(CMS_COLLECTIONS.planBlueprints, draft.id).catch(() => {});
      setDraft(null);
      setNotice("Floor deleted.");
    } catch (problem) {
      setError(problem?.message || "The floor could not be deleted.");
    } finally {
      setBusy("");
    }
  };

  // ---------- Screens ----------
  if (!draft) {
    return <div className="bp-home">
      <div className="bp-intro">
        <h3>Add a floor or building from a blueprint</h3>
        <p>Upload the contractor&apos;s blueprint, draw the rooms, hallways, stairs and doors on top (or let the AI draft them), check that it connects to the rest of the school, then publish. It joins the floor plan, routes, search, SiBot and AR.</p>
        <button type="button" className="attendance-save" onClick={startNew}><Icon name="plus" size={16} /> New floor</button>
      </div>
      {creating && <form className="cms-form bp-create" onSubmit={createFloor}>
        <label>Building<select value={creating.building} onChange={(event) => setCreating({ ...creating, building: event.target.value })}>
          {buildings.map((name) => <option key={name} value={name}>{name}</option>)}
          <option value="__new">New building…</option>
        </select></label>
        {creating.building === "__new" && <label>New building name<input value={creating.newBuilding} maxLength={80} onChange={(event) => setCreating({ ...creating, newBuilding: event.target.value })} placeholder="e.g. Science Annex" /></label>}
        <label>Floor number<input type="number" min={1} max={20} value={creating.level} onChange={(event) => setCreating({ ...creating, level: event.target.value })} placeholder={creating.building === BUILDING_NAME ? "5" : "1 (ground floor)"} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="bp-row"><button type="submit" className="attendance-save">Start</button><button type="button" className="cms-link-button" onClick={() => { setCreating(null); setError(""); }}>Cancel</button></div>
      </form>}
      {loadError && <p className="auth-error" role="alert">{loadError}</p>}
      {notice && <p className="auth-success" role="status">{notice}</p>}
      <div className="bp-list">
        {docs.length === 0 && <p className="cms-hint">No floors added yet.</p>}
        {[...docs].sort((a, b) => a.floor - b.floor).map((item) => <button key={item.id} type="button" onClick={() => openFloor(item)}>
          <span><b>{item.building}</b><small>{Number(item.level) === 1 ? "Ground floor" : `Floor ${item.level}`} · {(item.rooms || []).length} rooms</small></span>
          <span className={`cms-badge ${item.published ? "good" : "warn"}`}>{item.published ? "Published" : "Draft"}</span>
        </button>)}
      </div>
    </div>;
  }

  const current = selected ? draft[selected.kind][selected.index] : null;
  const preview = drag && { x: Math.min(drag.start.x, drag.end.x), y: Math.min(drag.start.y, drag.end.y), w: Math.abs(drag.end.x - drag.start.x), h: Math.abs(drag.end.y - drag.start.y) };
  const title = draft.building === BUILDING_NAME ? `${draft.building} · Floor ${draft.level}` : `${draft.building} · ${draft.level === 1 ? "Ground floor" : `Floor ${draft.level}`}`;

  return <div className="fp-admin">
    <div className="fp-admin-plan">
      <div className="fp-admin-head">
        <div><button type="button" className="cms-link-button" onClick={() => setDraft(null)}>← All added floors</button><h3 className="bp-title">{title} <span className={`cms-badge ${draft.published ? "good" : "warn"}`}>{draft.published ? "Published" : "Draft"}</span></h3></div>
        <div className="bp-row">
          <label className="cms-link-button bp-upload">{image ? "Replace blueprint" : "Upload blueprint"}<input type="file" accept="image/*" onChange={upload} /></label>
          <button type="button" className="cms-link-button" onClick={generate} disabled={!image || Boolean(busy)}><Icon name="sparkle" size={14} /> Generate with AI</button>
          <label className="cms-link-button bp-upload">Import traced plan<input type="file" accept=".json,application/json" onChange={importTrace} /></label>
        </div>
      </div>
      <div className="va-segment bp-tools" role="toolbar" aria-label="Drawing tools">
        {TOOLS.map((item) => <button key={item.id} type="button" className={tool === item.id ? "active" : ""} aria-pressed={tool === item.id} onClick={() => setTool(item.id)}>{item.label}</button>)}
      </div>
      <p className="cms-hint">{TOOLS.find((item) => item.id === tool).hint}</p>
      <svg ref={svgRef} className={`fp-admin-svg bp-canvas tool-${tool}`} viewBox="-2 -2 164 104" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} role="application" aria-label={`Blueprint editor for ${title}`}>
        <rect x="0" y="0" width="160" height="100" className="mp-floor" />
        {image && <image href={image} x="0" y="0" width="160" height="100" preserveAspectRatio="none" className="bp-image" />}
        {Array.from({ length: 15 }, (_, i) => <line key={`v${i}`} x1={(i + 1) * 10} y1="0" x2={(i + 1) * 10} y2="100" className="bp-grid" />)}
        {Array.from({ length: 9 }, (_, i) => <line key={`h${i}`} x1="0" y1={(i + 1) * 10} x2="160" y2={(i + 1) * 10} className="bp-grid" />)}
        {draft.halls.map((item, index) => <rect key={item.id} x={item.rect[0]} y={item.rect[1]} width={item.rect[2]} height={item.rect[3]} className={`bp-hall ${selected?.kind === "halls" && selected.index === index ? "selected" : ""}`} onClick={() => tool === "select" && pick({ kind: "halls", index })} />)}
        {draft.rooms.map((item, index) => {
          const [x, y, w, h] = item.rect;
          return <g key={item.id} className={`bp-room type-${item.type} ${selected?.kind === "rooms" && selected.index === index ? "selected" : ""}`} onClick={() => tool === "select" && pick({ kind: "rooms", index })}>
            <rect x={x} y={y} width={w} height={h} />
            {w >= 8 && h >= 5 && <text x={x + w / 2} y={y + h / 2}>{(item.code || item.name).slice(0, Math.max(3, Math.floor(w / 2)))}</text>}
            {item.door && <circle cx={item.door[0]} cy={item.door[1]} r="1.2" className="bp-door" />}
          </g>;
        })}
        {plan?.walks.map((walk, index) => <polyline key={`w${index}`} points={walk.points.map((point) => point.join(",")).join(" ")} className="bp-walk" />)}
        {preview && <rect x={preview.x} y={preview.y} width={preview.w} height={preview.h} className="bp-preview" />}
        <rect x="0" y="0" width="160" height="100" className="mp-outline" />
      </svg>
      <p className="fp-admin-legend"><span className="fp-key" /> Room <span className="fp-key bp-key-hall" /> Hallway <span className="fp-key bp-key-stairs" /> Stairs <span className="bp-key-door" /> Door <span className="bp-key-walk" /> Walking line (made from hallways)</p>
    </div>

    <div className="cms-form fp-admin-form">
      {busy && <p className="auth-success" role="status">{busy}</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && !busy && <p className="auth-success" role="status">{notice}</p>}

      {current && selected.kind === "rooms" && <div className="bp-panel">
        <div className="section-title-row"><div><p className="kicker">{TYPE_LABELS[current.type].toUpperCase()}</p><h3>Edit {current.type === "stairs" ? "stairs" : "room"}</h3></div></div>
        <label>Name<input value={current.name} maxLength={50} onChange={(event) => updateItem("rooms", selected.index, { name: event.target.value })} /></label>
        <label>Room number (optional)<input value={current.code} maxLength={20} placeholder="e.g. Room 501" onChange={(event) => updateItem("rooms", selected.index, { code: event.target.value })} /></label>
        <label>Used as<select value={current.type} onChange={(event) => updateItem("rooms", selected.index, { type: event.target.value })}>{ROOM_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}</select></label>
        {current.type === "stairs" && <label>Which stairs is this?<select value={stairOptions.some(([id]) => id === current.stair) ? current.stair : current.stair ? "__custom" : ""} onChange={(event) => updateItem("rooms", selected.index, { stair: event.target.value === "__custom" ? `stairs-${Date.now() % 1000}` : event.target.value })}>
          <option value="">Not connected yet</option>
          {stairOptions.map(([id, label]) => <option key={id} value={id}>Same stairs as: {label}</option>)}
          <option value="__custom">New stairs (only between added floors)</option>
        </select><small className="cms-hint">Stairs connect to the floor above or below when they share a name.</small></label>}
        <div className="bp-grid4">{["x", "y", "w", "h"].map((key, i) => <label key={key}>{key}<input type="number" step="0.5" value={current.rect[i]} onChange={(event) => updateItem("rooms", selected.index, { rect: current.rect.map((value, j) => (j === i ? Number(event.target.value) : value)) })} /></label>)}</div>
        <p className="cms-hint">{current.door ? `Door at ${current.door.join(", ")}.` : "No door yet: choose Door and tap this room's wall."}</p>
        <button type="button" className="cms-link-button bp-danger" onClick={() => removeItem("rooms", selected.index)}>Delete {current.type === "stairs" ? "stairs" : "room"}</button>
      </div>}

      {current && selected.kind === "halls" && <div className="bp-panel">
        <div className="section-title-row"><div><p className="kicker">HALLWAY</p><h3>Edit hallway</h3></div></div>
        <label>Name<input value={current.name} maxLength={50} onChange={(event) => updateItem("halls", selected.index, { name: event.target.value })} /></label>
        <div className="bp-grid4">{["x", "y", "w", "h"].map((key, i) => <label key={key}>{key}<input type="number" step="0.5" value={current.rect[i]} onChange={(event) => updateItem("halls", selected.index, { rect: current.rect.map((value, j) => (j === i ? Number(event.target.value) : value)) })} /></label>)}</div>
        <button type="button" className="cms-link-button bp-danger" onClick={() => removeItem("halls", selected.index)}>Delete hallway</button>
      </div>}

      <div className="bp-panel">
        <h3>Connections</h3>
        {checks?.stairs.length === 0 && <p className="cms-hint">No stairs on this floor yet.</p>}
        {checks?.stairs.map(({ item, neighbours }) => <p key={item.id} className={neighbours.length ? "bp-ok" : "bp-warn"}>{neighbours.length ? "✓" : "!"} {item.name}: {neighbours.length ? `connects to ${neighbours.map((other) => floorLabel(other.floor)).join(" and ")}` : "not connected (choose which stairs it is)"}</p>)}
        <p className="cms-hint">Walkways join this floor to a place in another building, such as its entrance.</p>
        {draft.links.map((item, index) => <div key={index} className="bp-link">
          <select value={item.from} onChange={(event) => update({ links: draft.links.map((link, i) => (i === index ? { ...link, from: event.target.value } : link)) })} aria-label="From this room">
            <option value="">From this room…</option>
            {draft.rooms.filter((room) => room.door).map((room) => <option key={room.id} value={room.id}>{room.code || room.name}</option>)}
          </select>
          <select value={item.to} onChange={(event) => update({ links: draft.links.map((link, i) => (i === index ? { ...link, to: event.target.value } : link)) })} aria-label="To this place">
            <option value="">To this place…</option>
            {linkTargets.map((place) => <option key={place.key} value={place.key}>{floorLabel(place.floor)} · {placeTitle(place)}</option>)}
          </select>
          <label className="bp-meters"><input type="number" min={1} max={2000} value={item.meters} onChange={(event) => update({ links: draft.links.map((link, i) => (i === index ? { ...link, meters: Number(event.target.value) } : link)) })} /> m</label>
          <button type="button" className="cms-link-button" onClick={() => update({ links: draft.links.filter((_, i) => i !== index) })} aria-label="Remove walkway">✕</button>
        </div>)}
        {draft.links.length < 20 && <button type="button" className="cms-link-button" onClick={() => update({ links: [...draft.links, { from: "", to: "", meters: 30 }] })}><Icon name="plus" size={14} /> Add walkway</button>}
      </div>

      <div className="bp-panel">
        <h3>Check before publishing</h3>
        <p className={checks?.connected ? "bp-ok" : "bp-warn"}>{checks?.connected ? "✓ Connected to the rest of the school" : "! Not connected yet: add stairs that match the floor next to it, or a walkway"}</p>
        <p className={checks?.noDoor.length ? "bp-warn" : "bp-ok"}>{checks?.noDoor.length ? `! ${checks.noDoor.length} without a door: ${checks.noDoor.slice(0, 4).map((item) => item.name).join(", ")}${checks.noDoor.length > 4 ? "…" : ""}` : "✓ Every room has a door"}</p>
        {checks?.connected && <p className={checks.unreachable.length ? "bp-warn" : "bp-ok"}>{checks.unreachable.length ? `! Can't be reached (door not on a hallway?): ${checks.unreachable.slice(0, 4).map((item) => item.name).join(", ")}` : "✓ Every room can be reached"}</p>}
        <label>Short label (optional)<input value={draft.label || ""} maxLength={60} placeholder="e.g. New wing" onChange={(event) => update({ label: event.target.value })} /></label>
        <div className="bp-row">
          <button type="button" className="cms-link-button" onClick={() => save(false)} disabled={Boolean(busy)}>Save draft</button>
          <button type="button" className="attendance-save" onClick={() => save(true)} disabled={Boolean(busy)}><Icon name="arrow" size={16} /> {draft.published ? "Update published floor" : "Publish"}</button>
        </div>
        {draft.published && <button type="button" className="cms-link-button" onClick={() => save(false)} disabled={Boolean(busy)}>Unpublish (hide from visitors)</button>}
        {docs.some((item) => item.id === draft.id) && <button type="button" className="cms-link-button bp-danger" onClick={remove} disabled={Boolean(busy)}>Delete this floor</button>}
      </div>
    </div>
  </div>;
}
