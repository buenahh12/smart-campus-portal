import { useEffect, useState } from "react";
import Icon from "./Icon";
import { CMS_COLLECTIONS, isClosureActive, todayKey, watchCollection } from "./cms";

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

export default function CampusUpdates() {
  const closures = usePublicCollection(CMS_COLLECTIONS.closures);
  const announcements = usePublicCollection(CMS_COLLECTIONS.announcements);
  const rooms = usePublicCollection(CMS_COLLECTIONS.rooms);
  const offices = usePublicCollection(CMS_COLLECTIONS.offices);
  const [search, setSearch] = useState("");
  const activeClosures = closures.items.filter((item) => isClosureActive(item));
  const notices = visibleAnnouncements(announcements.items).slice(0, 5);
  const term = search.trim().toLowerCase();
  const directory = [
    ...offices.items.map((item) => ({ ...item, kind: "Office" })),
    ...rooms.items.map((item) => ({ ...item, kind: item.type || "Room" })),
  ]
    .filter((item) => !term || [item.name, item.building, item.kind, item.room, item.description, item.notes].some((value) => String(value || "").toLowerCase().includes(term)))
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
          {activeClosures.length ? activeClosures.map((item) => <div className="closure-item" key={item.id}>
            <b>{item.pathway}</b>
            <small>{item.building} · {floorLabel(item.floor)} · {item.reason}{item.endDate ? ` · until ${item.endDate}` : ""}</small>
            {item.detour && <span><Icon name="route" size={14} /> {item.detour}</span>}
            {item.details && <p>{item.details}</p>}
          </div>) : <p className="updates-empty">{closures.loading ? "Checking pathways…" : "All campus pathways are open."}</p>}
        </article>
        <article className="updates-card tone-sage">
          <h3 className="updates-card-title"><span className="updates-icon" aria-hidden="true"><Icon name="sparkle" size={22} /></span> Announcements</h3>
          {notices.length ? notices.map((item) => <div className="notice-item" key={item.id}>
            <b>{item.pinned && <span className="cms-badge good">Pinned</span>}{item.title}</b>
            {item.updatedAt?.toDate && <small>{item.updatedAt.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</small>}
            <p>{item.body}</p>
          </div>) : <p className="updates-empty">{announcements.loading ? "Loading announcements…" : "No announcements right now."}</p>}
        </article>
        <article className="updates-card tone-sand">
          <h3 className="updates-card-title"><span className="updates-icon" aria-hidden="true"><Icon name="location" size={22} /></span> Rooms &amp; offices</h3>
          <input className="directory-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a room or office…" aria-label="Search rooms and offices" />
          <div className="directory-list">
            {directory.length ? directory.slice(0, 8).map((item) => <div className="directory-item" key={`${item.kind}-${item.id}`}>
              <div><b>{item.name}</b><small>{item.kind} · {item.building} · {floorLabel(item.floor)}{item.room ? ` · ${item.room}` : ""}</small>{item.hours && <small>{item.hours}</small>}</div>
              {item.status && <span className={`cms-badge ${item.status === "Available" ? "good" : item.status === "In use" ? "warn" : "bad"}`}>{item.status}</span>}
            </div>) : <p className="updates-empty">{rooms.loading || offices.loading ? "Loading directory…" : term ? "No matching rooms or offices." : "The directory hasn't been published yet."}</p>}
            {directory.length > 8 && <small className="directory-more">Showing 8 of {directory.length}. Search to narrow the list.</small>}
          </div>
        </article>
      </div>
      </div>
    </section>
  );
}
