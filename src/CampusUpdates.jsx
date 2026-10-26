import { useEffect, useState } from "react";
import Icon from "./Icon";
import { CMS_COLLECTIONS, isClosureActive, todayKey, watchCollection } from "./cms";
import { BUILDING_NAME, PLACES, findPlaceKey, floorLabel as planFloorLabel } from "./floorPlans";
import { usePlanVersion } from "./usePlan";
import { AnnouncementArt } from "./EventArt";

// Live, read-only view of an admin-managed collection for any visitor.
export function usePublicCollection(name) {
  const [state, setState] = useState({ items: [], loading: true, error: "" });
  useEffect(() => watchCollection(
    name,
    (items) => setState({ items, loading: false, error: "" }),
    () => setState({ items: [], loading: false, error: "Live campus information is unavailable right now." }),
    { publicOnly: true },
  ), [name]);
  return state;
}

export const visibleAnnouncements = (items, today = todayKey()) => items
  .filter((item) => item.published && (!item.expiresOn || item.expiresOn >= today))
  .sort((first, second) => Number(Boolean(second.pinned)) - Number(Boolean(first.pinned)));

const floorLabel = (floor) => (floor === 0 ? "Ground floor" : `Floor ${floor}`);
const PLAN_KINDS = { classroom: "Classroom", office: "Office", lab: "Laboratory", facility: "Facility", cr: "Comfort room" };

// Every named room on the floor plan, plus rooms and offices staff added in the Content
// manager. A staff entry that matches a floor plan room adds its details (hours, status)
// to that room instead of showing twice.
function buildDirectory(rooms, offices) {
  const entries = new Map(PLACES
    .filter((item) => !item.unlabeled && PLAN_KINDS[item.type])
    .map((item) => [item.key, { id: item.key, mapKey: item.key, name: item.name, room: item.code, kind: PLAN_KINDS[item.type], building: BUILDING_NAME, floorText: planFloorLabel(item.floor), notes: item.notes }]));
  const extra = [];
  [...offices.map((item) => ({ ...item, kind: "Office" })), ...rooms.map((item) => ({ ...item, kind: item.type || "Room" }))].forEach((item) => {
    const mapKey = findPlaceKey(item.room, item.name);
    const entry = { ...item, floorText: floorLabel(item.floor), mapKey };
    if (mapKey && entries.has(mapKey)) entries.set(mapKey, { ...entries.get(mapKey), ...entry, id: mapKey, room: item.room || entries.get(mapKey).room, floorText: entries.get(mapKey).floorText });
    else extra.push(entry);
  });
  return [...entries.values(), ...extra];
}

export default function CampusUpdates({ onShowMap }) {
  usePlanVersion();
  const closures = usePublicCollection(CMS_COLLECTIONS.closures);
  const announcements = usePublicCollection(CMS_COLLECTIONS.announcements);
  const rooms = usePublicCollection(CMS_COLLECTIONS.rooms);
  const offices = usePublicCollection(CMS_COLLECTIONS.offices);
  const [search, setSearch] = useState("");
  const activeClosures = closures.items.filter((item) => isClosureActive(item));
  const notices = visibleAnnouncements(announcements.items).slice(0, 5);
  const term = search.trim().toLowerCase();
  // Comfort rooms all share one name, so they only appear when someone searches for them.
  const wantsCr = /\b(c\.?r\.?|comfort|restroom|toilet|banyo|cr)\b/.test(term);
  const directory = buildDirectory(rooms.items, offices.items)
    .filter((item) => item.kind !== "Comfort room" || wantsCr)
    .filter((item) => !term || (wantsCr && item.kind === "Comfort room") || [item.name, item.building, item.kind, item.room, item.description, item.notes].some((value) => String(value || "").toLowerCase().includes(term)))
    .sort((first, second) => first.name.localeCompare(second.name, undefined, { numeric: true }));
  const unavailable = closures.error || announcements.error;
  const [showAll, setShowAll] = useState(false);
  const shown = term || showAll ? directory : directory.slice(0, DIRECTORY_PREVIEW);

  // Minimal: hallways and announcements are one line each when there is nothing to report, and
  // open into a short list only when there is; the directory shows a few places at a time.
  return (
    <section className="campus-updates today" id="updates" aria-labelledby="updates-title">
      <div className="ss-container">
      <div className="ss-section-head" data-reveal>
        <h2 id="updates-title" className="ss-display"><span>On campus</span> <span className="t-stripe">today</span></h2>
        <p>Closed hallways, news, and every room in one place.</p>
      </div>
      {unavailable && <p className="updates-unavailable">{unavailable}</p>}
      <div className="today-grid">
        <div className="today-status">
          <article className={`today-row ${activeClosures.length ? "is-alert" : "is-ok"}`} aria-labelledby="today-hallways">
            <span className="today-icon" aria-hidden="true"><Icon name={activeClosures.length ? "alert" : "route"} size={20} /></span>
            <div className="today-row-body">
              {/* Never say "all open" when the closures could not be loaded. */}
              <h3 id="today-hallways">{closures.loading ? "Checking hallways…" : closures.error ? "Hallway news couldn’t load" : activeClosures.length ? `${activeClosures.length} ${activeClosures.length === 1 ? "hallway is" : "hallways are"} closed` : "All hallways are open"}</h3>
              {activeClosures.length > 0 && <ul className="today-list">{activeClosures.map((item) => <li key={item.id}>
                <b>{item.pathway}</b>
                <small>{floorLabel(item.floor)} · {item.reason}{item.endDate ? ` · until ${item.endDate}` : ""}</small>
                {item.detour && <span className="today-detour"><Icon name="route" size={14} /> {item.detour}</span>}
              </li>)}</ul>}
            </div>
          </article>
          <article className="today-row" aria-labelledby="today-news">
            <span className="today-icon" aria-hidden="true"><Icon name="sparkle" size={20} /></span>
            <div className="today-row-body">
              <h3 id="today-news">{announcements.loading ? "Loading announcements…" : notices.length ? "Announcements" : announcements.error ? "Announcements couldn’t load" : "No new announcements"}</h3>
              {notices.length > 0 && <ul className="today-list">{notices.map((item) => <li key={item.id} className="today-notice">
                <AnnouncementArt className="today-thumb" title={item.title} body={item.body} picture={item.picture || "ai"} seed={item.pictureSeed} aiImage={item.pictureData} />
                <b>{item.pinned && <span className="cms-badge good">Pinned</span>}{item.title}</b>
                {item.updatedAt?.toDate && <small>{item.updatedAt.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small>}
                <p>{item.body}</p>
              </li>)}</ul>}
            </div>
          </article>
        </div>
        <article className="today-directory" aria-labelledby="today-rooms">
          <h3 id="today-rooms"><Icon name="location" size={20} /> Rooms &amp; offices</h3>
          <input className="today-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a room or office" aria-label="Search rooms and offices" />
          {shown.length ? <ul className={`today-rooms ${!term && !showAll ? "is-preview" : ""}`} aria-live="polite">{shown.map((item) => <li key={`${item.kind}-${item.id}`}>
            <div><b>{item.name}</b><small>{item.floorText}{item.room ? ` · ${item.room}` : ""}{item.hours ? ` · ${item.hours}` : ""}</small></div>
            {item.status && item.status !== "Available" && <span className={`cms-badge ${item.status === "In use" ? "warn" : "bad"}`}>{item.status}</span>}
            {item.mapKey && onShowMap && <button type="button" onClick={() => onShowMap(item.mapKey)} aria-label={`Show ${item.name} on the floor plan`}>Map</button>}
          </li>)}</ul> : <p className="today-empty">{term ? `No room called “${search.trim()}”. Try a room number like 204.` : "No rooms are listed yet."}</p>}
          {!term && directory.length > DIRECTORY_PREVIEW && <button type="button" className="today-more" onClick={() => setShowAll((open) => !open)}>
            {showAll ? "Show fewer" : `Show all ${directory.length} places`}
          </button>}
        </article>
      </div>
      </div>
    </section>
  );
}

const DIRECTORY_PREVIEW = 6;
