import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import "./analytics.css";
import Dollhouse3D from "./Dollhouse3D";
import { isMainBuildingRoute } from "./building3d";
import { usePublicCollection } from "./CampusUpdates";
import { CMS_COLLECTIONS, isClosureActive } from "./cms";
import { BUILDING_NAME, PLACES, blockedAreas, buildingOf, findRoute, floorLabel, placeByKey, placeTitle } from "./floorPlans";

// Full-screen 3D directions: pick where you are and where you're going, and a glowing ball walks
// the route through the 3D building, climbing the stairs, with the steps listed beside it.
// "Outside" shows the real building from the street. Other screens open it with:
// window.dispatchEvent(new CustomEvent("sscai:route3d", { detail: { start, end } })).

export const openRoute3D = (detail = {}) => window.dispatchEvent(new CustomEvent("sscai:route3d", { detail }));

const choices = () => PLACES
  .filter((place) => place.door && place.type !== "stairs" && !(place.unlabeled && place.type === "classroom") && buildingOf(place.floor) === BUILDING_NAME)
  .sort((a, b) => a.floor - b.floor || placeTitle(a).localeCompare(placeTitle(b), undefined, { numeric: true }));
const firstKey = (id) => PLACES.find((place) => place.id === id)?.key || "";

export default function Route3DView({ start, end, onClose, onOpenMap }) {
  const places = useMemo(choices, []);
  const [from, setFrom] = useState(start || firstKey("entrance"));
  const [to, setTo] = useState(end || firstKey("director"));
  const [view, setView] = useState("inside");
  const [replay, setReplay] = useState(0);
  const closures = usePublicCollection(CMS_COLLECTIONS.closures);
  const blockedKey = closures.items.filter((item) => isClosureActive(item)).map((item) => item.mapArea).sort().join("|");
  const route = useMemo(() => {
    if (!from || !to || from === to) return null;
    const found = findRoute(from, to, blockedAreas(closures.items.filter((item) => isClosureActive(item))));
    return found && !found.blocked && isMainBuildingRoute(found) ? { ...found, replay } : found?.blocked ? { blocked: true } : null;
  }, [from, to, replay, blockedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const showing = route && !route.blocked ? route : null;

  useEffect(() => {
    const key = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const option = (place) => <option key={place.key} value={place.key}>{placeTitle(place)} · {floorLabel(place.floor)}</option>;
  return <div className="route3d" role="dialog" aria-modal="true" aria-labelledby="route3d-title">
    <header className="route3d-head">
      <div>
        <p className="kicker">{"// 3D DIRECTIONS"}</p>
        <h2 id="route3d-title">Follow the glowing ball</h2>
      </div>
      <button type="button" className="route3d-close" onClick={onClose} aria-label="Close 3D directions"><Icon name="close" /></button>
    </header>
    <div className="route3d-body">
      <div className="route3d-stage">
        <Dollhouse3D className="route3d-canvas" floor={showing?.end.floor || 1} route={view === "inside" ? showing : null} highlight={showing?.end.key || null} view={view}
          label={showing ? `3D route from ${placeTitle(showing.start)} to ${placeTitle(showing.end)}` : "3D model of the Main Academic Building"}
          fallback={<p className="route3d-fallback">3D isn&apos;t available on this device. Use the 2D floor plan instead.</p>} />
        <div className="va-segment route3d-views" role="group" aria-label="View">
          <button type="button" className={view === "inside" ? "active" : ""} aria-pressed={view === "inside"} onClick={() => setView("inside")}>Inside</button>
          <button type="button" className={view === "outside" ? "active" : ""} aria-pressed={view === "outside"} onClick={() => setView("outside")}>Outside</button>
        </div>
      </div>
      <aside className="route3d-panel">
        <label>From (where you are)<select value={from} onChange={(event) => setFrom(event.target.value)}>{places.map(option)}</select></label>
        <button type="button" className="route3d-swap" onClick={() => { setFrom(to); setTo(from); }} aria-label="Swap from and to">⇅ Swap</button>
        <label>To (where you&apos;re going)<select value={to} onChange={(event) => setTo(event.target.value)}>{places.map(option)}</select></label>
        {route?.blocked && <p className="map-alert">No open route right now because a hallway or stairway is closed. Please ask school staff for help.</p>}
        {from === to && <p className="route3d-note">You&apos;re already there.</p>}
        {showing && <>
          <p className="route3d-summary"><b>{showing.minutes} min</b> · {showing.meters} m{showing.floors.length > 1 ? ` · ${showing.floors.length} floors` : ""}</p>
          <div className="route3d-actions">
            <button type="button" onClick={() => { setView("inside"); setReplay((count) => count + 1); }}><Icon name="arrow" size={15} /> Play again</button>
            {onOpenMap && <button type="button" onClick={() => onOpenMap(showing.end.key, showing.end.floor)}><Icon name="route" size={15} /> 2D map</button>}
          </div>
          <ol className="route3d-steps">
            {showing.steps.map((step, index) => <li key={index} className={`kind-${step.kind}`}><span>{step.text}</span>{step.meters ? <small>{step.meters} m</small> : null}</li>)}
          </ol>
        </>}
        {view === "outside" && <p className="route3d-note">The outside of the Main Academic Building. Tap <b>Inside</b> to watch the route.</p>}
      </aside>
    </div>
  </div>;
}
