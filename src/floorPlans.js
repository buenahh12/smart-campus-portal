// Floor plans of the Main Academic Building, traced from the posted floor plan signs.
// Every floor uses the same 160 x 100 grid (x to the right, y down; the north side
// with the fire-exit stairs is at the top). Rooms are rectangles [x, y, w, h] with a
// door point on the wall facing the hallway. Hallway "walk" lines are the centre
// lines people walk along; the route finder connects every door to them.
//
// The 1st (ground) floor is traced from the Grade 2 (Room 109) earthquake exit plan,
// which has no room names, so its other rooms are marked as unlabeled until the
// ground floor plan sign is added.

export const BUILDING_NAME = "Main Academic Building";
export const PLAN_WIDTH = 160;
export const PLAN_HEIGHT = 100;
export const METERS_PER_UNIT = 0.4; // estimate: the building is roughly 64 m wide
const STAIR_COST = 25; // one flight of stairs counts like ~10 m of walking
const WALK_SPEED = 1.2; // metres per second

export const floorLabel = (floor) => (floor === 1 ? "Ground floor" : `${floor}${floor === 2 ? "nd" : floor === 3 ? "rd" : "th"} floor`);

const room = (id, name, code, type, rect, door, extra = {}) => ({ id, name, code, type, rect, door, ...extra });

// Hallways shared by floors 1–3 (same structural frame).
const frameHalls = (topFrom) => [
  { id: "top-hall", name: "Top hallway", rect: [topFrom, 24, 137 - topFrom, 7] },
  { id: "left-hall", name: "Left hallway", rect: [32, 31, 15, 35] },
  { id: "right-hall", name: "Right hallway", rect: [125, 31, 12, 35] },
  { id: "bottom-hall", name: "Bottom hallway", rect: [32, 66, 109, 10] },
];

export const FLOORS = [
  {
    floor: 1,
    note: "Room names on the ground floor are pending; only Room 109 is labeled on the posted exit plan.",
    halls: [
      ...frameHalls(32),
      { id: "lobby", name: "Main lobby", rect: [0, 24, 32, 42] },
    ],
    walks: [
      { hall: "top-hall", points: [[28, 27.5], [39.5, 27.5], [131, 27.5]] },
      { hall: "left-hall", points: [[39.5, 27.5], [39.5, 57], [39.5, 71]] },
      { hall: "right-hall", points: [[131, 27.5], [131, 71]] },
      { hall: "bottom-hall", points: [[39.5, 71], [131, 71], [141, 71]] },
      { hall: "lobby", points: [[39.5, 57], [4, 57]] },
    ],
    rooms: [
      room("entrance", "Main entrance", "EXIT", "exit", [0, 50, 3, 14], [3, 57]),
      room("north-exit", "North exit", "EXIT", "exit", [124, 0, 7, 24], [127.5, 24]),
      room("offices-1", "Ground floor offices", "", "office", [0, 0, 32, 24], [28, 24], { unlabeled: true }),
      room("stair-nw-1", "North-west stairs", "", "stairs", [32, 0, 15, 24], [39.5, 24], { stair: "nw" }),
      room("g-101", "Unlabeled room", "", "classroom", [47, 0, 40, 24], [83, 24], { unlabeled: true }),
      room("g-102", "Unlabeled room", "", "classroom", [87, 0, 37, 24], [120, 24], { unlabeled: true }),
      room("g-103", "Unlabeled room", "", "classroom", [131, 0, 29, 24], [134, 24], { unlabeled: true }),
      room("g-104", "Unlabeled room", "", "classroom", [137, 24, 23, 24], [137, 28], { unlabeled: true }),
      room("cr-1", "C.R.", "", "cr", [137, 48, 23, 16], [137, 60]),
      room("g-105", "Unlabeled room", "", "classroom", [0, 66, 32, 34], [32, 70], { unlabeled: true }),
      room("stair-sw-1", "South-west stairs", "", "stairs", [32, 76, 15, 24], [39.5, 76], { stair: "sw" }),
      room("room-109", "Grade 2", "Room 109", "classroom", [47, 76, 39, 24], [50, 76]),
      room("g-110", "Unlabeled room", "", "classroom", [86, 76, 38, 24], [120, 76], { unlabeled: true }),
      room("g-111", "Unlabeled room", "", "classroom", [124, 76, 36, 24], [128, 76], { unlabeled: true }),
      room("stair-e-1", "East stairs", "", "stairs", [141, 64, 19, 12], [141, 71], { stair: "e" }),
      room("court-1", "Open court", "", "void", [47, 31, 78, 35], null),
    ],
  },
  {
    floor: 2,
    halls: [
      ...frameHalls(10),
      { id: "se-passage", name: "South-east passage", rect: [124, 76, 21, 13] },
    ],
    walks: [
      { hall: "top-hall", points: [[12, 27.5], [39.5, 27.5], [131, 27.5]] },
      { hall: "left-hall", points: [[39.5, 27.5], [39.5, 71]] },
      { hall: "right-hall", points: [[131, 27.5], [131, 71]] },
      { hall: "bottom-hall", points: [[39.5, 71], [127, 71], [131, 71], [141, 71]] },
      { hall: "se-passage", points: [[127, 71], [127, 86], [143, 86]] },
    ],
    rooms: [
      room("director", "Director's Office", "", "office", [0, 0, 10, 31], [10, 28]),
      room("fire-exit-2", "Fire exit (outdoor stairs)", "EXIT", "exit", [10, 0, 4, 24], [12, 24]),
      room("guidance", "Guidance Office", "", "office", [14, 0, 7, 24], [17.5, 24]),
      room("clinic", "Clinic", "", "office", [21, 0, 11, 24], [26, 24]),
      room("stair-nw-2", "North-west stairs", "", "stairs", [32, 0, 15, 24], [39.5, 24], { stair: "nw" }),
      room("room-204", "Grade 3 Sapphire", "Room 204", "classroom", [47, 0, 39, 24], [50, 24]),
      room("room-205", "Grade 5 Chrysolite", "Room 205", "classroom", [86, 0, 38, 24], [120, 24]),
      room("room-206", "Grade 5 Chalcedony", "Room 206", "classroom", [124, 0, 36, 24], [128, 24]),
      room("room-207", "Grade 4 Amethyst", "Room 207", "classroom", [137, 24, 23, 20], [137, 28]),
      room("room-208", "Grade 4 Sardonyx", "Room 208", "classroom", [137, 44, 23, 21], [137, 62]),
      room("tvl-room", "TVL Room", "", "facility", [0, 31, 32, 17], [32, 46]),
      room("tle-room", "TLE Room", "", "facility", [0, 48, 32, 18], [32, 63]),
      room("cr-2w", "C.R.", "", "cr", [0, 66, 21, 8], [21, 70]),
      room("computer-room", "Computer Room", "", "lab", [0, 74, 32, 26], [32, 77]),
      room("stair-sw-2", "South-west stairs", "", "stairs", [32, 76, 15, 24], [39.5, 76], { stair: "sw" }),
      room("room-211", "Grade 7 Fire Opal", "Room 211", "classroom", [47, 76, 39, 24], [50, 76]),
      room("room-210", "Grade 6 Turquoise", "Room 210", "classroom", [86, 76, 38, 24], [120, 76]),
      room("stair-e-2", "East stairs", "", "stairs", [141, 65, 19, 11], [141, 71], { stair: "e" }),
      room("cr-2-girls", "C.R. Girls", "", "cr", [130, 77, 15, 8], [130, 81]),
      room("cr-2-boys", "C.R. Boys", "", "cr", [145, 77, 15, 12], [145, 86]),
      room("room-209", "Room 209", "Room 209", "classroom", [130, 89, 30, 11], [132, 89]),
      room("void-2", "Open to below", "", "void", [47, 31, 78, 35], null),
    ],
  },
  {
    floor: 3,
    halls: frameHalls(0),
    walks: [
      { hall: "top-hall", points: [[5.5, 27.5], [39.5, 27.5], [131, 27.5]] },
      { hall: "left-hall", points: [[39.5, 27.5], [39.5, 71]] },
      { hall: "right-hall", points: [[131, 27.5], [131, 71]] },
      { hall: "bottom-hall", points: [[39.5, 71], [131, 71], [141, 71]] },
    ],
    rooms: [
      room("stair-w-3", "West stairs (up to 4th floor)", "", "stairs", [0, 0, 11, 24], [5.5, 24], { stair: "w" }),
      room("video-room", "Video Room", "", "facility", [11, 0, 18, 24], [16, 24]),
      room("fire-exit-3", "Fire exit (outdoor stairs)", "EXIT", "exit", [29, 0, 3, 24], [30.5, 24]),
      room("stair-nw-3", "North-west stairs", "", "stairs", [32, 0, 15, 24], [39.5, 24], { stair: "nw" }),
      room("room-303", "Grade 11 STEM", "Room 303", "classroom", [47, 0, 39, 24], [83, 24]),
      room("room-304", "Grade 9 Tiger Eye", "Room 304", "classroom", [86, 0, 38, 24], [89, 24]),
      room("room-305", "Grade 9 Star Rose Quartz", "Room 305", "classroom", [124, 0, 36, 22], [128, 22]),
      room("cr-3-girls", "C.R. Girls", "", "cr", [137, 22, 23, 7], [137, 25.5]),
      room("cr-3-boys", "C.R. Boys", "", "cr", [137, 29, 23, 7], [137, 32]),
      room("faculty-hs", "Faculty (High School)", "", "office", [137, 36, 23, 7], [137, 39]),
      room("room-307", "Grade 6 Carnelian", "Room 307", "classroom", [137, 43, 23, 19], [137, 59]),
      room("stair-e-3", "East stairs", "", "stairs", [141, 62, 19, 12], [141, 71], { stair: "e" }),
      room("audio-visual", "Audio Visual Room", "", "facility", [0, 31, 32, 19], [32, 47]),
      room("library-hs", "Library (High School)", "", "facility", [0, 50, 32, 16], [32, 63]),
      room("room-311", "Grade 12 ATH", "Room 311", "classroom", [0, 66, 32, 34], [32, 70]),
      room("stair-sw-3", "South-west stairs", "", "stairs", [32, 76, 15, 24], [39.5, 76], { stair: "sw" }),
      room("room-310", "Grade 8 Moonstone", "Room 310", "classroom", [47, 76, 39, 24], [50, 76]),
      room("room-309", "Grade 7 Crystal", "Room 309", "classroom", [86, 76, 38, 24], [89, 76]),
      room("faculty-elem", "Faculty (Elementary)", "", "office", [124, 76, 36, 24], [127, 76]),
      room("void-3", "Open to below", "", "void", [47, 31, 78, 35], null),
    ],
  },
  {
    floor: 4,
    halls: [
      { id: "left-hall", name: "Left hallway", rect: [7, 0, 9, 79] },
      { id: "top-hall", name: "Top hallway", rect: [16, 21, 129, 9] },
    ],
    walks: [
      { hall: "left-hall", points: [[11.5, 4], [11.5, 25.5], [11.5, 79]] },
      { hall: "top-hall", points: [[11.5, 25.5], [128, 25.5], [145, 25.5]] },
      { hall: "industrial", name: "Industrial Room", points: [[128, 25.5], [128, 40], [155, 64]], closable: false },
    ],
    rooms: [
      room("stair-w-4", "West stairs (down to 3rd floor)", "", "stairs", [0, 0, 7, 22], [7, 18], { stair: "w" }),
      room("fire-exit-4", "Fire exit (outdoor stairs)", "EXIT", "exit", [7, 0, 9, 4], [11.5, 4]),
      room("cr-4w", "C.R.", "", "cr", [0, 23, 7, 8], [7, 27]),
      room("room-401", "Physics Room", "Room 401", "lab", [16, 0, 34, 21], [19, 21]),
      room("room-402", "Biology Room", "Room 402", "lab", [50, 0, 37.5, 21], [53, 21]),
      room("room-403", "Chemistry Room", "Room 403", "lab", [87.5, 0, 38, 21], [91, 21]),
      room("room-404", "TVL (Bartending)", "Room 404", "facility", [125.5, 0, 34.5, 21], [129, 21]),
      room("cr-4e", "C.R.", "", "cr", [145, 21, 15, 9], [145, 25.5]),
      room("room-406", "Grade 10 Aquamarine", "Room 406", "classroom", [16, 30, 33, 20], [16, 33]),
      room("room-407", "Grade 10 Smithsonite", "Room 407", "classroom", [16, 50, 33, 20], [16, 53]),
      room("room-405", "Industrial Room", "Room 405", "facility", [126, 30, 34, 38], [128, 30]),
      room("fire-exit-4e", "Fire exit (Industrial Room)", "EXIT", "exit", [152, 64, 8, 5], [155, 64]),
      room("room-408", "Grade 11 ATH", "Room 408", "classroom", [16, 71, 26, 28], [16, 74]),
      room("room-409", "Files Room", "Room 409", "office", [0, 79, 16, 20], [8, 79]),
      room("void-4", "Open to below", "", "void", [49, 30, 77, 40], null),
      room("roof-deck", "Roof deck", "", "deck", [42, 70, 118, 29], null),
    ],
  },
];

// Places people can pick as a start or destination.
export const PLACES = FLOORS.flatMap(({ floor, rooms }) => rooms
  .filter((item) => item.door)
  .map((item) => ({ ...item, floor, key: `${floor}:${item.id}` })));

// ---------- Room details edited by the administrator ----------
// The walls, doors, and hallways above are fixed, but what each room is called and used
// for comes from the mapRooms collection (edited in Content manager → Floor plan), so the
// school can rename or repurpose rooms without changing code. Values here are the defaults.
export const EDITABLE_TYPES = [
  { value: "classroom", label: "Classroom" },
  { value: "office", label: "Office" },
  { value: "lab", label: "Laboratory" },
  { value: "facility", label: "Facility" },
  { value: "cr", label: "Comfort room" },
];
export const isEditableSpot = (item) => Boolean(item.door) && EDITABLE_TYPES.some((type) => type.value === item.base?.type);
export const mapRoomDocId = (key) => key.replace(":", "-");

const allRooms = () => [...FLOORS.flatMap(({ rooms }) => rooms), ...PLACES];
allRooms().forEach((item) => {
  item.base = { name: item.name, code: item.code, type: item.type, unlabeled: Boolean(item.unlabeled) };
  item.notes = "";
});

let planVersion = 0;
const planListeners = new Set();
export const getPlanVersion = () => planVersion;
export const subscribePlan = (listener) => {
  planListeners.add(listener);
  return () => planListeners.delete(listener);
};

// overrides: { "2-clinic": { name, code, type, notes }, ... }
export function applyMapOverrides(overrides) {
  for (const { floor, rooms } of FLOORS) {
    for (const item of rooms) {
      const custom = overrides[mapRoomDocId(`${floor}:${item.id}`)];
      const next = custom && isEditableSpot(item)
        ? { name: custom.name || item.base.name, code: custom.code ?? item.base.code, type: custom.type || item.base.type, unlabeled: false, notes: custom.notes || "", edited: true }
        : { ...item.base, notes: "", edited: false };
      Object.assign(item, next);
      const place = PLACES.find((entry) => entry.key === `${floor}:${item.id}`);
      if (place) Object.assign(place, next);
    }
  }
  planVersion += 1;
  planListeners.forEach((listener) => listener(planVersion));
}

export const placeByKey = (key) => PLACES.find((item) => item.key === key) || null;
export const placeTitle = (place) => (place.code && place.code !== "EXIT" && place.code !== place.name ? `${place.code} · ${place.name}` : place.name);

// Closable map areas for the Content Manager: every hallway and staircase.
export const MAP_AREAS = FLOORS.flatMap(({ floor, halls, rooms }) => [
  ...halls.map((hall) => ({ value: `${floor}:${hall.id}`, label: `${floorLabel(floor)} · ${hall.name}`, floor })),
  ...rooms.filter((item) => item.type === "stairs").map((item) => ({ value: `${floor}:${item.id}`, label: `${floorLabel(floor)} · ${item.name}`, floor })),
]);
export const mapAreaLabel = (value) => MAP_AREAS.find((item) => item.value === value)?.label || "";

// Finds the plan room that best matches a name such as "Room 204", "204" or "Clinic".
export function findPlaceKey(...queries) {
  for (const raw of queries) {
    const query = String(raw || "").toLowerCase().trim();
    if (!query) continue;
    const number = query.match(/\b(\d{3})\b/)?.[1];
    if (number) {
      const byCode = PLACES.find((item) => item.code.toLowerCase() === `room ${number}`);
      if (byCode) return byCode.key;
    }
    const byName = PLACES.find((item) => !item.unlabeled && item.type !== "exit" && (item.name.toLowerCase() === query || query.includes(item.name.toLowerCase())));
    if (byName) return byName.key;
  }
  return null;
}

// ---------- Navigation graph ----------

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function project(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return { t, x: a.x + t * dx, y: a.y + t * dy };
}

function buildGraph() {
  const nodes = new Map();
  const edges = new Map();
  const addNode = (id, data) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, ...data });
      edges.set(id, []);
    }
    return id;
  };
  const link = (a, b, tags, weight) => {
    const w = weight ?? dist(nodes.get(a), nodes.get(b));
    edges.get(a).push({ to: b, w, tags });
    edges.get(b).push({ to: a, w, tags });
  };

  for (const { floor, walks, rooms } of FLOORS) {
    const pointId = (x, y) => addNode(`${floor}:p:${x},${y}`, { floor, x, y, kind: "hall" });
    const segments = [];
    for (const walk of walks) {
      for (let index = 0; index < walk.points.length - 1; index += 1) {
        const [ax, ay] = walk.points[index];
        const [bx, by] = walk.points[index + 1];
        segments.push({ a: pointId(ax, ay), b: pointId(bx, by), hall: walk.hall, closable: walk.closable !== false, stops: [] });
      }
    }
    for (const item of rooms) {
      if (!item.door) continue;
      const [x, y, w, h] = item.rect;
      const center = addNode(`${floor}:${item.id}`, { floor, x: x + w / 2, y: y + h / 2, kind: "room", room: item.id });
      const door = addNode(`${floor}:door:${item.id}`, { floor, x: item.door[0], y: item.door[1], kind: "door", room: item.id });
      const tags = item.type === "stairs" ? [`${floor}:${item.id}`] : [];
      link(center, door, tags);
      let best = null;
      for (const segment of segments) {
        const hit = project(nodes.get(door), nodes.get(segment.a), nodes.get(segment.b));
        const d = dist(hit, nodes.get(door));
        if (!best || d < best.d) best = { segment, hit, d };
      }
      if (best) {
        const stop = addNode(`${floor}:s:${item.id}`, { floor, x: best.hit.x, y: best.hit.y, kind: "hall" });
        best.segment.stops.push({ id: stop, t: best.hit.t });
        link(door, stop, tags);
      }
    }
    for (const segment of segments) {
      const chain = [segment.a, ...segment.stops.sort((p, q) => p.t - q.t).map((stop) => stop.id), segment.b];
      for (let index = 0; index < chain.length - 1; index += 1) {
        if (chain[index] !== chain[index + 1]) link(chain[index], chain[index + 1], segment.closable ? [`${floor}:${segment.hall}`] : [], undefined);
      }
      for (const id of chain) nodes.get(id).hall = nodes.get(id).hall || segment.hall;
    }
  }

  // Stairs with the same stair id connect neighbouring floors.
  for (const { floor, rooms } of FLOORS) {
    for (const item of rooms.filter((entry) => entry.stair)) {
      const above = FLOORS.find((entry) => entry.floor === floor + 1)?.rooms.find((entry) => entry.stair === item.stair);
      if (above) {
        const a = `${floor}:${item.id}`;
        const b = `${floor + 1}:${above.id}`;
        edges.get(a).push({ to: b, w: STAIR_COST, tags: [a, b], stairs: true });
        edges.get(b).push({ to: a, w: STAIR_COST, tags: [a, b], stairs: true });
      }
    }
  }
  return { nodes, edges };
}

const GRAPH = buildGraph();
export const graphNode = (id) => GRAPH.nodes.get(id);

// Dijkstra from one place. blocked is a Set of "floor:areaId" strings.
function shortestFrom(startKey, blocked) {
  const best = new Map([[startKey, 0]]);
  const previous = new Map();
  const queue = [[0, startKey]];
  const done = new Set();
  while (queue.length) {
    queue.sort((p, q) => p[0] - q[0]);
    const [cost, id] = queue.shift();
    if (done.has(id)) continue;
    done.add(id);
    for (const edge of GRAPH.edges.get(id) || []) {
      if (edge.tags.some((tag) => blocked.has(tag))) continue;
      const next = cost + edge.w;
      if (next < (best.get(edge.to) ?? Infinity)) {
        best.set(edge.to, next);
        previous.set(edge.to, { from: id, edge });
        queue.push([next, edge.to]);
      }
    }
  }
  return { best, previous };
}

function trace(previous, startKey, endKey) {
  const path = [endKey];
  const via = [];
  let current = endKey;
  while (current !== startKey) {
    const step = previous.get(current);
    if (!step) return null;
    via.unshift(step.edge);
    current = step.from;
    path.unshift(current);
  }
  return { path, via };
}

const hallName = (floor, hallId) => {
  const plan = FLOORS.find((entry) => entry.floor === floor);
  return plan?.halls.find((hall) => hall.id === hallId)?.name || plan?.walks.find((walk) => walk.hall === hallId)?.name;
};

function describe(path, via, start, end) {
  const steps = [];
  let walked = 0;
  let current = null;
  let lastDirection = null;
  const turnWord = (from, to) => {
    if (!from) return "Head";
    const cross = from.x * to.y - from.y * to.x;
    const dot = from.x * to.x + from.y * to.y;
    if (Math.abs(cross) < 0.2 * Math.hypot(from.x, from.y) * Math.hypot(to.x, to.y)) return dot >= 0 ? "Continue" : "Turn around and walk";
    return cross > 0 ? "Turn right" : "Turn left";
  };
  const flush = () => {
    if (current && current.meters >= 1) {
      const inside = current.name.toLowerCase().includes("room");
      const place = inside ? `the ${current.name}` : `the ${current.name.toLowerCase()}`;
      const text = current.verb === "Head" ? `Walk ${inside ? "through" : "along"} ${place}` : current.verb === "Continue" ? `Continue ${inside ? "through" : "along"} ${place}` : `${current.verb} ${inside ? "and walk through" : "into"} ${place}`;
      const kind = current.verb === "Turn left" ? "left" : current.verb === "Turn right" ? "right" : current.verb.startsWith("Turn around") ? "around" : "straight";
      steps.push({ floor: current.floor, text, kind, meters: Math.round(current.meters) });
    }
    current = null;
  };
  steps.push({ floor: start.floor, kind: "start", text: start.type === "exit" ? `Start at the ${start.name.toLowerCase()} on the ${floorLabel(start.floor).toLowerCase()}` : `Leave ${placeTitle(start)} (${floorLabel(start.floor).toLowerCase()})` });
  for (let index = 0; index < via.length; index += 1) {
    const a = GRAPH.nodes.get(path[index]);
    const b = GRAPH.nodes.get(path[index + 1]);
    const edge = via[index];
    if (edge.stairs) {
      flush();
      const stairsRoom = FLOORS.find((entry) => entry.floor === a.floor).rooms.find((item) => item.id === a.room);
      const stairsName = stairsRoom.name.replace(/ \(.*\)/, "").toLowerCase();
      const previousStep = steps[steps.length - 1];
      if (previousStep?.stairs && previousStep.stairsName === stairsName) {
        previousStep.toFloor = b.floor;
        previousStep.kind = b.floor > previousStep.floor ? "up" : "down";
        previousStep.text = `Take the ${stairsName} ${b.floor > previousStep.floor ? "up" : "down"} to the ${floorLabel(b.floor).toLowerCase()}`;
        walked += STAIR_COST * METERS_PER_UNIT;
        lastDirection = null;
        continue;
      }
      steps.push({ floor: a.floor, stairsName, text: `Take the ${stairsName} ${b.floor > a.floor ? "up" : "down"} to the ${floorLabel(b.floor).toLowerCase()}`, stairs: true, kind: b.floor > a.floor ? "up" : "down", toFloor: b.floor });
      walked += STAIR_COST * METERS_PER_UNIT;
      lastDirection = null;
      continue;
    }
    const meters = dist(a, b) * METERS_PER_UNIT;
    walked += meters;
    const hallTag = edge.tags.find((tag) => !tag.includes("stair"));
    const hallId = hallTag?.split(":")[1] || (a.kind === "hall" && b.kind === "hall" ? a.hall : null);
    const direction = { x: b.x - a.x, y: b.y - a.y };
    if (hallId && a.kind === "hall" && b.kind === "hall") {
      const name = hallName(a.floor, hallId) || "Hallway";
      if (!current || current.name !== name) {
        flush();
        current = { floor: a.floor, name, meters: 0, verb: turnWord(lastDirection, direction) };
      }
      current.meters += meters;
    }
    if (meters > 0.01) lastDirection = direction;
  }
  flush();
  steps.push({ floor: end.floor, text: end.type === "exit" ? `Go out through the ${end.name.toLowerCase()}` : `Arrive at ${placeTitle(end)}`, done: true, kind: end.type === "exit" ? "exit" : "arrive" });
  const seconds = walked / WALK_SPEED;
  return { steps, meters: Math.round(walked), minutes: Math.max(1, Math.round(seconds / 60)) };
}

// Route between two places, or null when closures leave no way through.
export function findRoute(startKey, endKey, blocked = new Set()) {
  if (!startKey || !endKey || startKey === endKey) return null;
  const { previous } = shortestFrom(startKey, blocked);
  const found = trace(previous, startKey, endKey);
  if (!found) return { blocked: true };
  const start = placeByKey(startKey);
  const end = placeByKey(endKey);
  return { ...found, ...describe(found.path, found.via, start, end), start, end, floors: [...new Set(found.path.map((id) => GRAPH.nodes.get(id).floor))] };
}

// Route to whichever exit is closest by walking distance.
export function findNearestExit(startKey, blocked = new Set()) {
  if (!startKey) return null;
  const start = placeByKey(startKey);
  if (start?.type === "exit") return { atExit: true, start };
  const { best } = shortestFrom(startKey, blocked);
  const exits = PLACES.filter((item) => item.type === "exit" && item.key !== startKey && best.has(item.key));
  if (!exits.length) return placeByKey(startKey)?.type === "exit" ? null : { blocked: true };
  const nearest = exits.reduce((p, q) => (best.get(q.key) < best.get(p.key) ? q : p));
  return findRoute(startKey, nearest.key, blocked);
}

// Closure records from the Content Manager -> the set of blocked map areas.
export const blockedAreas = (closures) => new Set(closures.map((item) => item.mapArea).filter(Boolean));
