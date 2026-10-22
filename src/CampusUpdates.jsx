import { useEffect, useState } from "react";
import Icon from "./Icon";
import { CMS_COLLECTIONS, isClosureActive, todayKey, watchCollection } from "./cms";
import { BUILDING_NAME, PLACES, findPlaceKey, floorLabel as planFloorLabel } from "./floorPlans";
import { usePlanVersion } from "./usePlan";
import { AnnouncementArt, ClosureArt } from "./EventArt";

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

  return (
    <section className="campus-updates" id="updates" aria-labelledby="updates-title">
      <div className="ss-container">
      <div className="ss-section-head" data-reveal>
        <h2 id="updates-title" className="ss-display"><span>On campus</span> <span className="t-stripe">today</span></h2>
        <p>Closed hallways, school announcements, and the room directory, kept up to date by school staff.</p>
      </div>
      {unavailable && <p className="updates-unavailable">{unavailable}</p>}
      <div className="updates-grid" data-reveal>
        <article className="updates-card tone-clay">
          <h3 className="updates-card-title"><span className="updates-icon" aria-hidden="true"><Icon name="alert" size={22} /></span> Closed hallways</h3>
          <div className="updates-scroll" tabIndex={0} aria-label="Closed hallways">{activeClosures.length ? activeClosures.map((item) => <div className="closure-item" key={item.id}>
            <ClosureArt closure={item} />
            <b>{item.pathway}</b>
            <small>{item.building} Â· {floorLabel(item.floor)} Â· {item.reason}{item.endDate ? ` Â· until ${item.endDate}` : ""}</small>
            {item.detour && <span><Icon name="route" size={14} /> {item.detour}</span>}
            {item.details && <p>{item.details}</p>}
          </div>) : <p className="updates-empty">{closures.loading ? "Checking pathwaysâ€¦" : "All campus pathways are open."}</p>}</div>
        </article>
        <article className="updates-card tone-sage">
          <h3 className="updates-card-title"><span className="updates-icon" aria-hidden="true"><Icon name="sparkle" size={22} /></span> Announcements</h3>
          <div className="updates-scroll" tabIndex={0} aria-label="Announcements">{notices.length ? notices.map((item) => <div className="notice-item" key={item.id}>
            <AnnouncementArt title={item.title} body={item.body} picture={item.picture || "ai"} seed={item.pictureSeed} aiImage={item.pictureData} />
            <b>{item.pinned && <span className="cms-badge good">Pinned</span>}{item.title}</b>
            {item.updatedAt?.toDate && <small>{item.updatedAt.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</small>}
            <p>{item.body}</p>
          </div>) : <p className="updates-empty">{announcements.loading ? "Loading announcementsâ€¦" : "No announcements right now."}</p>}</div>
        </article>
        <article className="updates-card tone-sand">
          <h3 className="updates-card-title"><span className="updates-icon" aria-hidden="true"><Icon name="location" size={22} /></span> Rooms &amp; offices</h3>
          <input className="directory-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a room or officeâ€¦" aria-label="Search rooms and offices" />
          <small className="directory-more" aria-live="polite">{directory.length} {directory.length === 1 ? "place" : "places"}{term ? ` matching â€œ${search.trim()}â€` : " Â· scroll or search"}</small>
          <div className="directory-list" tabIndex={0} aria-label="Rooms and offices">
            {directory.length ? directory.map((item) => <div className="directory-item" key={`${item.kind}-${item.id}`}>
              <div><b>{item.name}</b><small>{item.kind} Â· {item.floorText}{item.room ? ` Â· ${item.room}` : ""}</small>{item.hours && <small>{item.hours}</small>}{item.notes && <small>{item.notes}</small>}</div>
              <div className="directory-actions">
                {item.status && <span className={`cms-badge ${item.status === "Available" ? "good" : item.status === "In use" ? "warn" : "bad"}`}>{item.status}</span>}
                {item.mapKey && onShowMap && <button type="button" className="directory-map" onClick={() => onShowMap(item.mapKey)} aria-label={`Show ${item.name} on the floor plan`}><Icon name="route" size={14} /> Map</button>}
              </div>
            </div>) : <p className="updates-empty">{term ? "No matching rooms or offices." : "No rooms are listed yet."}</p>}          </div>
        </article>
      </div>
      </div>
    </section>
  );
}
