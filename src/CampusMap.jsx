import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { usePublicCollection } from "./CampusUpdates";
import { CMS_COLLECTIONS, isClosureActive } from "./cms";
import { usePlanVersion } from "./usePlan";
import {
  BUILDING_NAME,
  FLOORS,
  PLACES,
  PLAN_HEIGHT,
  PLAN_WIDTH,
  blockedAreas,
  findNearestExit,
  findRoute,
  floorLabel,
  graphNode,
  placeByKey,
  placeTitle,
} from "./floorPlans";

const DEFAULT_START = "1:entrance";
const START_STORAGE = "campus-map-start";
const ASPECT = (PLAN_HEIGHT + 16) / (PLAN_WIDTH + 8);
const isNarrow = () => typeof window !== "undefined" && window.innerWidth <= 900;
// Whole floor plus title block; wide screens leave room on the left for the floor picker.
const homeView = () => (isNarrow() ? { x: -4, y: -4, w: PLAN_WIDTH + 8, h: (PLAN_WIDTH + 8) * ASPECT } : { x: -17, y: -5, w: PLAN_WIDTH + 22, h: (PLAN_WIDTH + 22) * ASPECT });
const MIN_WIDTH = 28;
const DOOR = 2.8; // door leaf width in plan units
const floorShort = (floor) => (floor === 1 ? "G" : String(floor));

const readStart = () => {
  try {
    const saved = localStorage.getItem(START_STORAGE);
    return saved && placeByKey(saved) ? saved : DEFAULT_START;
  } catch {
    return DEFAULT_START;
  }
};

function wrap(text, maxChars) {
  const lines = [];
  for (const word of text.split(" ")) {
    const last = lines[lines.length - 1];
    if (last && `${last} ${word}`.length <= maxChars) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines.slice(0, 3);
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// Door opening on the room wall: a gap in the wall plus the swing of the door leaf.
function doorShape(rect, door) {
  const [x, y, w, h] = rect;
  const [dx, dy] = door;
  const near = (a, b) => Math.abs(a - b) < 0.01;
  let along;
  let inward;
  let hinge;
  if (near(dy, y) || near(dy, y + h)) {
    const cx = clamp(dx, x + DOOR / 2 + 0.4, x + w - DOOR / 2 - 0.4);
    along = { x: 1, y: 0 };
    inward = { x: 0, y: near(dy, y) ? 1 : -1 };
    hinge = { x: cx - DOOR / 2, y: dy };
  } else if (near(dx, x) || near(dx, x + w)) {
    const cy = clamp(dy, y + DOOR / 2 + 0.4, y + h - DOOR / 2 - 0.4);
    along = { x: 0, y: 1 };
    inward = { x: near(dx, x) ? 1 : -1, y: 0 };
    hinge = { x: dx, y: cy - DOOR / 2 };
  } else {
    return null;
  }
  const gapEnd = { x: hinge.x + along.x * DOOR, y: hinge.y + along.y * DOOR };
  const leaf = { x: hinge.x + inward.x * DOOR, y: hinge.y + inward.y * DOOR };
  const cross = (leaf.x - hinge.x) * (gapEnd.y - hinge.y) - (leaf.y - hinge.y) * (gapEnd.x - hinge.x);
  return {
    gap: `M${hinge.x} ${hinge.y} L${gapEnd.x} ${gapEnd.y}`,
    swing: `M${hinge.x} ${hinge.y} L${leaf.x} ${leaf.y} A${DOOR} ${DOOR} 0 0 ${cross > 0 ? 1 : 0} ${gapEnd.x} ${gapEnd.y}`,
  };
}

// Window marks wherever a room touches the outside wall, like the posted plans.
function windowMarks(rect) {
  const [x, y, w, h] = rect;
  const marks = [];
  const add = (x1, y1, x2, y2, horizontal) => {
    const length = horizontal ? x2 - x1 : y2 - y1;
    if (length < 8) return;
    const size = Math.min(14, length * 0.5);
    const start = (horizontal ? x1 : y1) + (length - size) / 2;
    marks.push(horizontal ? { x: start, y: y1, w: size, h: 0, horizontal } : { x: x1, y: start, w: 0, h: size, horizontal });
  };
  if (y === 0) add(x, 0, x + w, 0, true);
  if (y + h === PLAN_HEIGHT) add(x, PLAN_HEIGHT, x + w, PLAN_HEIGHT, true);
  if (x === 0) add(0, y, 0, y + h, false);
  if (x + w === PLAN_WIDTH) add(PLAN_WIDTH, y, PLAN_WIDTH, y + h, false);
  return marks;
}

function stairTreads(rect) {
  const [x, y, w, h] = rect;
  const lines = [];
  if (w >= h) for (let tx = x + 1.4; tx < x + w - 0.6; tx += 1.4) lines.push(`M${tx} ${y + 0.6} L${tx} ${y + h - 0.6}`);
  else for (let ty = y + 1.4; ty < y + h - 0.6; ty += 1.4) lines.push(`M${x + 0.6} ${ty} L${x + w - 0.6} ${ty}`);
  return lines.join(" ");
}

function routeRuns(route, floor) {
  if (!route?.path) return [];
  const runs = [];
  let run = [];
  for (const id of route.path) {
    const node = graphNode(id);
    if (node.kind === "room" && (id === route.path[0] || id === route.path[route.path.length - 1])) continue;
    if (node.floor === floor) run.push(node);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

function runArrows(run) {
  const arrows = [];
  for (let index = 0; index < run.length - 1; index += 1) {
    const a = run[index];
    const b = run[index + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 7) continue;
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    const count = Math.floor(length / 14) || 1;
    for (let step = 1; step <= count; step += 1) {
      const t = step / (count + 1);
      arrows.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle });
    }
  }
  return arrows;
}

function stairBadges(route, floor) {
  if (!route?.via) return [];
  return route.via.flatMap((edge, index) => {
    const from = graphNode(route.path[index]);
    const to = graphNode(route.path[index + 1]);
    return edge.stairs && from.floor === floor ? [{ x: from.x, y: from.y, toFloor: to.floor, up: to.floor > floor }] : [];
  });
}

function FloorPlan2D({ plan, route, startKey, destKey, selectedKey, blocked, onPick, onFloor }) {
  const svgRef = useRef(null);
  const [view, setView] = useState(homeView);
  const pointers = useRef(new Map());
  const gesture = useRef({ moved: false, distance: null });
  const floor = plan.floor;
  const runs = routeRuns(route, floor);
  const badges = stairBadges(route, floor);
  const start = placeByKey(startKey);
  const dest = route?.end || placeByKey(destKey);
  const toExit = route?.end?.type === "exit";

  const routeId = route?.path ? `${route.path[0]}>${route.path[route.path.length - 1]}` : "";
  useEffect(() => {
    const nodes = runs.flat();
    if (!isNarrow() || nodes.length < 2) {
      setView(homeView());
      return;
    }
    const xs = nodes.map((node) => node.x);
    const ys = nodes.map((node) => node.y);
    const pad = 20;
    let w = Math.max(70, Math.max(...xs) - Math.min(...xs) + pad * 2);
    let h = Math.max(...ys) - Math.min(...ys) + pad * 2;
    if (h > w * ASPECT) w = h / ASPECT;
    h = w * ASPECT;
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    setView({ x: cx - w / 2, y: cy - h / 2, w, h });
  }, [floor, routeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAround = (current, factor, px, py) => {
    const w = clamp(current.w * factor, MIN_WIDTH, homeView().w * 1.25);
    const h = w * (ASPECT);
    return { x: px - (px - current.x) * (w / current.w), y: py - (py - current.y) * (h / current.h), w, h };
  };
  const zoomCenter = (factor) => setView((current) => zoomAround(current, factor, current.x + current.w / 2, current.y + current.h / 2));
  const toPlan = (clientX, clientY, current) => {
    const box = svgRef.current.getBoundingClientRect();
    const scale = Math.max(current.w / box.width, current.h / box.height);
    const offsetX = (box.width * scale - current.w) / 2;
    const offsetY = (box.height * scale - current.h) / 2;
    return { x: current.x - offsetX + (clientX - box.left) * scale, y: current.y - offsetY + (clientY - box.top) * scale, scale };
  };

  useEffect(() => {
    const svg = svgRef.current;
    const onWheel = (event) => {
      event.preventDefault();
      setView((current) => {
        const point = toPlan(event.clientX, event.clientY, current);
        return zoomAround(current, event.deltaY > 0 ? 1.15 : 1 / 1.15, point.x, point.y);
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture.current = { moved: false, distance: null };
  };
  const onPointerMove = (event) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    if (pointers.current.size === 1) {
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        gesture.current.moved = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      if (gesture.current.moved) setView((current) => {
        const { scale } = toPlan(0, 0, current);
        return { ...current, x: current.x - dx * scale, y: current.y - dy * scale };
      });
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.current.distance) {
        const factor = gesture.current.distance / distance;
        setView((current) => {
          const center = toPlan((a.x + b.x) / 2, (a.y + b.y) / 2, current);
          return zoomAround(current, factor, center.x, center.y);
        });
      }
      gesture.current.distance = distance;
      gesture.current.moved = true;
    }
  };
  const onPointerUp = (event) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) gesture.current.distance = null;
  };
  const pick = (key) => !gesture.current.moved && onPick(key);

  const rooms = plan.rooms;
  const solidRooms = rooms.filter((item) => item.type !== "void" && item.type !== "deck");

  return (
    <div className="plan-2d">
      <svg
        ref={svgRef}
        className="plan-svg"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${floorLabel(floor)} plan of the ${BUILDING_NAME}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <pattern id="plan-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" className="plan-grid-line" /></pattern>
          <pattern id="plan-hatch" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(90)"><line x1="0" y1="0" x2="0" y2="1.6" className="plan-hatch-line" /></pattern>
          <pattern id="plan-closed" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2" className="plan-closed-line" /></pattern>
        </defs>
        <g className="plan-layer" key={floor}>
        <rect className="plan-paper" x="-200" y="-200" width={PLAN_WIDTH + 400} height={PLAN_HEIGHT + 400} />

        {/* Floor, hallways and open areas */}
        <rect className="plan-floor" x="0" y="0" width={PLAN_WIDTH} height={PLAN_HEIGHT} />
        {plan.halls.map((hall) => {
          const [x, y, w, h] = hall.rect;
          const closed = blocked.has(`${floor}:${hall.id}`);
          const vertical = h > w * 1.5;
          const label = hall.id === "lobby" ? "MAIN LOBBY" : w * h < 400 ? "" : "HALLWAY";
          return <g key={hall.id} className={`plan-hall ${closed ? "closed" : ""}`}>
            {closed && <rect x={x} y={y} width={w} height={h} className="plan-closed-fill" />}
            {(label || closed) && <text x={x + w / 2} y={y + h / 2} transform={vertical ? `rotate(-90 ${x + w / 2} ${y + h / 2})` : undefined}>{closed ? "CLOSED" : label}</text>}
          </g>;
        })}
        {rooms.filter((item) => item.type === "void" || item.type === "deck").map((item) => {
          const [x, y, w, h] = item.rect;
          return <g key={item.id} className={`plan-${item.type}`}>
            <rect x={x} y={y} width={w} height={h} fill={item.type === "deck" ? "url(#plan-hatch)" : undefined} />
            {item.type === "void" && <path d={`M${x} ${y}L${x + w} ${y + h}M${x + w} ${y}L${x} ${y + h}`} />}
            <text x={x + w / 2} y={y + h / 2}>{item.type === "void" ? (floor === 1 ? "OPEN COURT" : "OPEN BELOW") : "ROOF DECK"}</text>
          </g>;
        })}

        {/* Rooms */}
        {solidRooms.map((item) => {
          const key = `${floor}:${item.id}`;
          const [x, y, w, h] = item.rect;
          const closed = blocked.has(key);
          const classes = ["plan-room", `type-${item.type}`, item.unlabeled && "unlabeled", key === selectedKey && "selected", key === dest?.key && "destination", key === startKey && "start", closed && "closed"].filter(Boolean).join(" ");
          return <g key={item.id} className={classes} onClick={() => pick(key)} onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && onPick(key)} tabIndex={0} role="button" aria-label={`${placeTitle({ ...item, floor })}${closed ? ", closed" : ""}`}>
            <rect x={x} y={y} width={w} height={h} className="plan-room-fill" />
            {item.type === "stairs" && <path d={stairTreads(item.rect)} className="plan-treads" />}
            {closed && <rect x={x} y={y} width={w} height={h} className="plan-closed-fill" />}
          </g>;
        })}
        <g className="plan-walls">
          {solidRooms.map((item) => <rect key={item.id} x={item.rect[0]} y={item.rect[1]} width={item.rect[2]} height={item.rect[3]} />)}
        </g>
        <rect className="plan-outer-wall" x="0" y="0" width={PLAN_WIDTH} height={PLAN_HEIGHT} />
        <g className="plan-windows">
          {solidRooms.flatMap((item) => windowMarks(item.rect).map((mark, index) => <g key={`${item.id}-${index}`}>
            <rect x={mark.horizontal ? mark.x : mark.x - 0.75} y={mark.horizontal ? mark.y - 0.75 : mark.y} width={mark.horizontal ? mark.w : 1.5} height={mark.horizontal ? 1.5 : mark.h} className="plan-window-gap" />
            {[-0.35, 0.35].map((offset) => <line key={offset} x1={mark.horizontal ? mark.x : mark.x + offset} y1={mark.horizontal ? mark.y + offset : mark.y} x2={mark.horizontal ? mark.x + mark.w : mark.x + offset} y2={mark.horizontal ? mark.y + offset : mark.y + mark.h} />)}
          </g>))}
        </g>
        <g className="plan-doors">
          {solidRooms.filter((item) => item.door).map((item) => {
            const shape = doorShape(item.rect, item.door);
            if (!shape) return null;
            return <g key={item.id} className={item.type === "exit" ? "exit" : undefined}>
              <path d={shape.gap} className="plan-door-gap" />
              {item.type !== "exit" && item.type !== "stairs" && <path d={shape.swing} className="plan-door-swing" />}
            </g>;
          })}
        </g>

        {/* Labels */}
        <g className="plan-labels">
          {solidRooms.map((item) => {
            const [x, y, w, h] = item.rect;
            const cx = x + w / 2;
            const cy = y + h / 2;
            if (item.type === "exit") {
              return <text key={item.id} className="plan-exit-label" x={cx} y={cy} transform={h > w ? `rotate(-90 ${cx} ${cy})` : undefined}>{w > 5 || h > 5 ? "EXIT" : ""}</text>;
            }
            if (item.type === "stairs") {
              const size = Math.min(1.7, Math.max(w, h) / 9);
              return <g key={item.id}>
                <rect x={cx - size * 3.3} y={cy - size * 0.85} width={size * 6.6} height={size * 1.7} className="plan-stairs-tag" />
                <text className="plan-stairs-label" x={cx} y={cy} fontSize={size}>STAIRS</text>
              </g>;
            }
            const vertical = h > w * 1.6 && w < 12;
            const span = vertical ? h : w;
            const nameSize = clamp(span / 13, 1.25, 2);
            const name = item.unlabeled ? "UNLABELED" : item.name.toUpperCase();
            const nameLines = vertical ? [name] : wrap(name, Math.max(5, Math.floor(span / (nameSize * 0.72))));
            const code = item.code && item.code !== item.name && item.code !== "EXIT" ? item.code : "";
            const codeSize = nameSize * 1.12;
            const total = nameLines.length * nameSize * 1.2 + (code ? codeSize * 1.5 : 0);
            if ((vertical ? w : h) < nameSize * 2) return null;
            return <text key={item.id} className={`plan-room-label ${item.unlabeled ? "muted" : ""}`} x={cx} y={cy - total / 2 + nameSize * 0.9} transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}>
              {nameLines.map((line, index) => <tspan key={line + index} x={cx} dy={index === 0 ? 0 : nameSize * 1.2} fontSize={nameSize} className="plan-name">{line}</tspan>)}
              {code && <tspan x={cx} dy={codeSize * 1.45} fontSize={codeSize} className="plan-code">{code}</tspan>}
            </text>;
          })}
        </g>

        {/* Route */}
        {runs.map((run, index) => {
          const points = run.map((node) => `${node.x},${node.y}`).join(" ");
          return <g key={`${routeId}-${index}`} className={`plan-route ${toExit ? "to-exit" : ""}`}>
            <polyline points={points} className="casing" pathLength="1" />
            <polyline points={points} className="line" pathLength="1" />
            {runArrows(run).map((arrow, arrowIndex) => <path key={arrowIndex} d="M-0.55 -0.7 L0.45 0 L-0.55 0.7" transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`} className="chevron" />)}
          </g>;
        })}
        {badges.map((badge) => <g key={`${badge.x}-${badge.toFloor}`} className="plan-stair-badge" transform={`translate(${badge.x} ${badge.y - 6})`} onClick={() => onFloor(badge.toFloor)} role="button" tabIndex={0} aria-label={`Go to the ${floorLabel(badge.toFloor)}`} onKeyDown={(event) => event.key === "Enter" && onFloor(badge.toFloor)}>
          <rect x="-8.5" y="-2.4" width="17" height="4.8" rx="0.8" />
          <path d={badge.up ? "M-6.4 0.9 L-5.2 -0.9 L-4 0.9 Z" : "M-6.4 -0.9 L-5.2 0.9 L-4 -0.9 Z"} />
          <text x="1.2" y="0">{floorLabel(badge.toFloor).toUpperCase()}</text>
        </g>)}
        {start?.floor === floor && (() => {
          const node = (route?.path && graphNode(`${floor}:door:${start.id}`)) || graphNode(start.key);
          return <g className="plan-you" transform={`translate(${node.x} ${node.y})`}>
            <circle r="4" className="halo" />
            <circle r="1.7" className="dot" />
            {route?.path && <g transform="translate(0 -4.6)"><rect x="-6.4" y="-1.7" width="12.8" height="3.4" rx="0.6" /><text y="0">YOU ARE HERE</text></g>}
          </g>;
        })()}
        {dest?.floor === floor && (() => {
          const node = graphNode(`${floor}:door:${dest.id}`) || graphNode(dest.key);
          return <g className={`plan-pin ${dest.type === "exit" ? "exit" : ""}`} transform={`translate(${node.x} ${node.y})`}>
            <path d="M0 0 C-0.6 -1.6 -2.6 -3 -2.6 -5.2 A2.6 2.6 0 1 1 2.6 -5.2 C2.6 -3 0.6 -1.6 0 0 Z" />
            <circle cy="-5.2" r="1" />
          </g>;
        })()}

        {/* Title block, like the posted floor plan signs */}
        <g className="plan-title-block">
          <text x="0" y={PLAN_HEIGHT + 6.5} className="title">{floorLabel(floor).toUpperCase()} PLAN</text>
          <text x="0" y={PLAN_HEIGHT + 10.5} className="sub">{BUILDING_NAME.toUpperCase()} · SCALE: NTS</text>
          <line x1="86" y1={PLAN_HEIGHT + 8} x2={PLAN_WIDTH - 2} y2={PLAN_HEIGHT + 8} />
          <circle cx={PLAN_WIDTH - 5} cy={PLAN_HEIGHT + 8} r="2.6" />
        </g>
        </g>
      </svg>
      <div className="plan-zoom" role="group" aria-label="Map zoom">
        <button type="button" onClick={() => zoomCenter(1 / 1.35)} aria-label="Zoom in"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
        <button type="button" onClick={() => zoomCenter(1.35)} aria-label="Zoom out"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg></button>
        <button type="button" onClick={() => setView(homeView())} aria-label="Fit the whole floor"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg></button>
      </div>
    </div>
  );
}

const STEP_ICONS = {
  start: <circle cx="12" cy="12" r="4" />,
  straight: <path d="M12 19V5m-5 5 5-5 5 5" />,
  left: <path d="M16 20v-7a4 4 0 0 0-4-4H5m4-4L5 9l4 4" />,
  right: <path d="M8 20v-7a4 4 0 0 1 4-4h7m-4-4 4 4-4 4" />,
  around: <path d="M8 20V9a4 4 0 0 1 8 0v6m-3-3 3 3 3-3" />,
  up: <path d="M4 20h4v-4h4v-4h4V8h4M15 4h5v5" />,
  down: <path d="M4 8h4v4h4v4h4v4h4M4 4v5h5" />,
  arrive: <path d="M6 21V4h11l-2 4 2 4H6" />,
  exit: <path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" />,
};

// Built on each render because staff can rename rooms while the map is open.
export const placeOptions = () => FLOORS.map(({ floor }) => ({
  floor,
  places: PLACES.filter((item) => item.floor === floor && item.type !== "stairs" && !(item.unlabeled && item.type === "classroom"))
    .sort((a, b) => (a.type === "exit") - (b.type === "exit") || placeTitle(a).localeCompare(placeTitle(b), undefined, { numeric: true })),
}));

export default function CampusMap({ onClose, initialFloor = 2, initialDestination = null, initialEmergency = false }) {
  const closures = usePublicCollection(CMS_COLLECTIONS.closures);
  const planVersion = usePlanVersion();
  const [startKey, setStartKey] = useState(readStart);
  const [destKey, setDestKey] = useState(initialDestination);
  const [emergency, setEmergency] = useState(initialEmergency);
  const [selectedKey, setSelectedKey] = useState(initialDestination);
  const [floor, setFloor] = useState(() => (initialEmergency || initialDestination ? placeByKey(readStart())?.floor : null) || initialFloor);
  const activeClosures = closures.items.filter((item) => isClosureActive(item));
  const blockedKey = activeClosures.map((item) => item.mapArea).filter(Boolean).sort().join("|");
  const blocked = useMemo(() => blockedAreas(activeClosures), [blockedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const route = useMemo(() => (emergency ? findNearestExit(startKey, blocked) : findRoute(startKey, destKey, blocked)), [emergency, startKey, destKey, blocked, planVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = FLOORS.find((item) => item.floor === floor);
  const selected = placeByKey(selectedKey);
  const routeFloors = route?.floors || [];

  useEffect(() => {
    try { localStorage.setItem(START_STORAGE, startKey); } catch { /* storage unavailable */ }
  }, [startKey]);

  useEffect(() => {
    const onKeyDown = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const chooseDestination = (key, { jump = true } = {}) => {
    setEmergency(false);
    setDestKey(key || null);
    setSelectedKey(key || null);
    if (jump && key) setFloor(placeByKey(startKey).floor);
  };
  const chooseStart = (key) => {
    setStartKey(key);
    setFloor(placeByKey(key).floor);
  };
  const pickOnMap = (key) => {
    const place = placeByKey(key);
    if (!place) return;
    setSelectedKey(key);
    if (place.type !== "stairs" && key !== startKey) chooseDestination(key, { jump: false });
  };
  const swap = () => {
    if (!destKey) return;
    setStartKey(destKey);
    setDestKey(startKey);
    setSelectedKey(startKey);
    setFloor(placeByKey(destKey).floor);
  };
  const toggleEmergency = () => {
    setEmergency((on) => !on);
    setSelectedKey(null);
    setFloor(placeByKey(startKey).floor);
  };

  const placeSelect = (value, onChange, label, includeEmpty) => <select value={value || ""} onChange={(event) => onChange(event.target.value)} aria-label={label}>
    {includeEmpty && <option value="">Choose a room or office</option>}
    {placeOptions().map((group) => <optgroup key={group.floor} label={floorLabel(group.floor)}>{group.places.map((item) => <option key={item.key} value={item.key}>{placeTitle(item)}</option>)}</optgroup>)}
  </select>;

  return (
    <div className="map-shell" role="dialog" aria-modal="true" aria-labelledby="campus-map-title">
      <header className="map-header">
        <div className="map-title">
          <h2 id="campus-map-title">Floor plan</h2>
          <span>{BUILDING_NAME}</span>
        </div>
        <button className="map-close" onClick={onClose} aria-label="Close floor plan"><Icon name="close" size={20} /></button>
      </header>
      <div className="map-body">
        <section className="map-stage" aria-label="Floor plan">
          <div className="map-floors" role="tablist" aria-label="Floor">
            <span>Floor</span>
            {[...FLOORS].reverse().map((item) => <button key={item.floor} type="button" role="tab" aria-selected={floor === item.floor} aria-label={floorLabel(item.floor)} className={floor === item.floor ? "active" : ""} onClick={() => setFloor(item.floor)}>
              {floorShort(item.floor)}{routeFloors.includes(item.floor) && <i aria-hidden="true" />}
            </button>)}
          </div>
          <div className="map-canvas">
            <FloorPlan2D plan={plan} route={route?.path ? route : null} startKey={startKey} destKey={destKey} selectedKey={selectedKey} blocked={blocked} onPick={pickOnMap} onFloor={setFloor} />
          </div>
          <div className="map-key" aria-label="Map key">
            <span><i className="key-you" /> You are here</span>
            <span><i className="key-route" /> Route</span>
            <span><i className="key-exit" /> Exit</span>
            <span><i className="key-stairs" /> Stairs</span>
            <span><i className="key-closed" /> Closed</span>
            <span className="map-key-hint">Tap a room for directions · drag to move · pinch or scroll to zoom</span>
          </div>
          {plan.note && <p className="map-note">{plan.note}</p>}
        </section>

        <aside className="map-panel">
          <div className="map-route-form">
            <div className="map-route-points" aria-hidden="true"><i className="from" /><span /><i className={emergency ? "exit" : "to"} /></div>
            <label><span>From</span>{placeSelect(startKey, chooseStart, "Starting point")}</label>
            <label><span>To</span>{emergency ? <div className="map-exit-target">Nearest exit</div> : placeSelect(destKey, (key) => chooseDestination(key), "Destination", true)}</label>
            <button type="button" className="map-swap" onClick={swap} disabled={!destKey || emergency} aria-label="Swap start and destination"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v16m0 0-4-4m4 4 4-4M16 20V4m0 0-4 4m4-4 4 4" /></svg></button>
          </div>

          <button type="button" className={`map-exit-button ${emergency ? "active" : ""}`} onClick={toggleEmergency}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{STEP_ICONS.exit}</svg>
            {emergency ? "Showing the nearest exit — cancel" : "Nearest exit"}
          </button>

          {selected && selected.key !== startKey && !emergency && <div className="map-selected">
            <div><b>{placeTitle(selected)}</b><small>{floorLabel(selected.floor)}{selected.unlabeled ? " · name not posted yet" : ""}</small>{selected.notes && <small>{selected.notes}</small>}</div>
            <button type="button" onClick={() => { chooseStart(selected.key); setDestKey(null); setSelectedKey(null); }}>I&apos;m here</button>
          </div>}

          <div className="map-directions" aria-live="polite">
            {route?.atExit
              ? <p className="map-alert">You&apos;re already at an exit: the {route.start.name.toLowerCase()}. Choose your room in From to see the way out from there.</p>
              : route?.blocked
              ? <p className="map-alert">No open route right now because a hallway or stairway is closed. Please ask school staff for help.</p>
              : route?.steps
                ? <>
                  <div className="map-summary">
                    <b>{route.minutes} min</b>
                    <span>{route.meters} m{route.floors.length > 1 ? ` · ${route.floors.length} floors` : ""}</span>
                  </div>
                  {emergency && <p className="map-alert">In a real emergency, stay calm and follow your teacher and school staff.</p>}
                  <ol className="map-steps">
                    {route.steps.map((step, index) => <li key={`${route.start.key}-${route.end.key}-${index}`} style={{ "--i": index }} className={`kind-${step.kind} ${step.floor === floor ? "on-floor" : ""}`}>
                      <button type="button" onClick={() => setFloor(step.stairs ? step.toFloor : step.floor)}>
                        <span className="step-icon"><svg viewBox="0 0 24 24" aria-hidden="true">{STEP_ICONS[step.kind] || STEP_ICONS.straight}</svg></span>
                        <span className="step-text">{step.text}<small>{floorLabel(step.floor)}{step.meters ? ` · ${step.meters} m` : ""}</small></span>
                      </button>
                    </li>)}
                  </ol>
                </>
                : <p className="map-empty">Choose where you are and where you&apos;re going, or tap a room on the plan.</p>}
          </div>

          {activeClosures.length > 0 && <div className="map-closures">
            <b>Closed today</b>
            {activeClosures.map((item) => <small key={item.id}>{item.pathway} · {floorLabel(item.floor)}{item.mapArea ? " · avoided" : ""}{item.detour ? ` · ${item.detour}` : ""}</small>)}
          </div>}
        </aside>
      </div>
    </div>
  );
}
