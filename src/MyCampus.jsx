import { useEffect, useState } from "react";
import Icon from "./Icon";
import { usePublicCollection, visibleAnnouncements } from "./CampusUpdates";
import { CMS_COLLECTIONS, GRADE_LEVELS, MAX_SAVED_PLACES, MAX_SECTION_LENGTH, USER_ROLES, isClosureActive, placeKey, saveProfile, setEmailUpdates, watchProfile, watchSubscription } from "./cms";
import { BUILDING_NAME, PLACES, buildingOf, classroomOf, floorLabel as planFloorLabel, placeByKey, placeTitle, sectionsOf } from "./floorPlans";
import { searchPlace } from "./placeSearch";
import { refreshEmailConfirmed, sendConfirmationEmail, wantsEmailUpdates, wishForEmailUpdates } from "./firebase";

const floorLabel = (floor) => (floor === 0 ? "Ground floor" : `Floor ${floor}`);
const TYPE_LABELS = { classroom: "Classroom", office: "Office", lab: "Laboratory", facility: "Facility", cr: "Comfort room", exit: "Exit" };
// A floor-plan place as a My Campus row. Saved as "map:<key>" next to older directory entries.
const mapRow = (place) => ({ saveKey: `map:${place.key}`, mapKey: place.key, name: placeTitle(place), floor: place.floor, building: buildingOf(place.floor), detail: `${TYPE_LABELS[place.type] || "Place"} · ${planFloorLabel(place.floor)}` });
const statusTone = (status) => (status === "Available" ? "good" : status === "In use" ? "warn" : "bad");

// Personal navigation hub for signed-in users: saved places, route alerts for
// those places, and preferences, all stored on their account in Firestore.
export default function MyCampus({ user, onClose, onSignOut, onShowMap, onShow3D, renderAssistant }) {
  const [profile, setProfile] = useState(); // undefined while loading, null if never saved
  const [profileError, setProfileError] = useState("");
  const [search, setSearch] = useState("");
  const [emailUpdates, setEmailUpdatesState] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const rooms = usePublicCollection(CMS_COLLECTIONS.rooms);
  const offices = usePublicCollection(CMS_COLLECTIONS.offices);
  const closures = usePublicCollection(CMS_COLLECTIONS.closures);
  const announcements = usePublicCollection(CMS_COLLECTIONS.announcements);

  useEffect(() => watchSubscription(user.uid, setEmailUpdatesState), [user.uid]);

  // Email updates need a confirmed email (firestore.rules). Check again on open, since they may
  // have just clicked the link, and start the updates they asked for at sign-up once confirmed.
  const [confirmed, setConfirmed] = useState(user.emailVerified);
  const [confirmNote, setConfirmNote] = useState("");
  useEffect(() => {
    if (!user.email || user.emailVerified) return undefined;
    let live = true;
    refreshEmailConfirmed(user).then((ok) => { if (live) setConfirmed(ok); }).catch(() => {});
    return () => { live = false; };
  }, [user]);
  useEffect(() => {
    if (!confirmed || !wantsEmailUpdates(user.uid)) return;
    setEmailUpdates(user, user.displayName || "", true).then(() => wishForEmailUpdates(user.uid, false)).catch(() => {});
  }, [confirmed, user]);
  const checkConfirmed = () => refreshEmailConfirmed(user)
    .then((ok) => {
      setConfirmed(ok);
      setConfirmNote(ok ? "" : "It isn't confirmed yet. Check your inbox and spam folder.");
    })
    .catch(() => setConfirmNote("Couldn't check right now. Check your connection and try again."));
  const resendConfirmation = () => sendConfirmationEmail(user)
    .then(() => setConfirmNote("A new link is on its way."))
    .catch((error) => setConfirmNote(error.code === "auth/too-many-requests" ? "Please wait a few minutes before asking for another link." : "The link couldn't be sent. Try again later."));
  useEffect(() => watchProfile(user.uid, setProfile, () => setProfileError("Your saved places could not be loaded. Check your connection and try again.")), [user.uid]);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    const onKeyDown = (event) => event.key === "Escape" && onClose();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const name = profile?.name || user.displayName || user.email?.split("@")[0] || "there";
  const firstName = name.split(" ")[0];
  const role = profile?.role || "Student";
  const gradeLevel = profile?.gradeLevel || "";
  const section = profile?.section || "";
  const myClassroom = role === "Student" ? classroomOf(gradeLevel, section) : null;
  const [sectionDraft, setSectionDraft] = useState(null); // typed but not saved yet
  const prefs = { speakAnswers: false, allClosureAlerts: true, ...profile?.prefs };
  const savedKeys = profile?.savedPlaces || [];
  const places = [
    ...offices.items.map((item) => ({ ...item, kind: "Office" })),
    ...rooms.items.map((item) => ({ ...item, kind: item.type || "Room" })),
  ];
  // Everything on the floor plan you can walk to (what the home page search finds).
  const mapPlaces = PLACES.filter((place) => place.door && place.type !== "stairs" && !(place.unlabeled && place.type === "classroom"));
  const activeClosures = closures.items.filter((item) => isClosureActive(item));
  const closuresNear = (place) => activeClosures.filter((item) => item.building === place.building && item.floor === place.floor);
  const savedPlaces = savedKeys.map((key) => {
    if (key.startsWith("map:")) {
      const place = placeByKey(key.slice(4));
      return place ? mapRow(place) : null;
    }
    const entry = places.find((place) => placeKey(place) === key);
    return entry ? { ...entry, saveKey: key, detail: `${entry.kind} · ${entry.building} · ${floorLabel(entry.floor)}${entry.room ? ` · ${entry.room}` : ""}` } : null;
  }).filter(Boolean);
  const affectedPlaces = savedPlaces.filter((place) => closuresNear(place).length);
  const alertList = prefs.allClosureAlerts
    ? activeClosures
    : activeClosures.filter((closure) => savedPlaces.some((place) => place.building === closure.building && place.floor === closure.floor));
  const term = search.trim().toLowerCase();
  // The same search as the home page first (it knows "cr", "nurse", "204"…), then name matches.
  const results = (() => {
    if (!term) return [];
    const found = searchPlace(search.trim(), "");
    const best = [found?.key, ...(found?.suggestions || [])].filter(Boolean).map((key) => placeByKey(key)).filter(Boolean);
    // Asked for a C.R.: list them all, lowest floor first.
    if (best[0]?.type === "cr") best.push(...mapPlaces.filter((place) => place.type === "cr").sort((a, b) => a.floor - b.floor));
    // Name matches only from 3 letters, so "cr" doesn't also find "Crystal".
    const named = term.length < 3 ? [] : mapPlaces.filter((place) => [placeTitle(place), place.name, place.code, TYPE_LABELS[place.type]].some((value) => String(value || "").toLowerCase().includes(term)))
      .sort((first, second) => placeTitle(first).localeCompare(placeTitle(second), undefined, { numeric: true }));
    return [...new Map([...best, ...named].map((place) => [place.key, place])).values()].slice(0, 6).map(mapRow);
  })();
  const notices = visibleAnnouncements(announcements.items).slice(0, 3);

  const update = async (changes) => {
    setProfileError("");
    try {
      await saveProfile(user.uid, changes);
    } catch (error) {
      setProfileError(error?.code === "permission-denied"
        ? "Your account could not save this change. The Firestore rules may not be deployed yet."
        : "That change could not be saved. Check your connection and try again.");
    }
  };

  const toggleSaved = (place) => {
    const key = place.saveKey;
    if (savedKeys.includes(key)) {
      update({ savedPlaces: savedKeys.filter((item) => item !== key) });
    } else if (savedKeys.length >= MAX_SAVED_PLACES) {
      setProfileError(`You can save up to ${MAX_SAVED_PLACES} places. Remove one to add another.`);
    } else {
      update({ savedPlaces: [...savedKeys, key] });
    }
  };

  const placeRow = (place, { showSave }) => {
    const nearby = closuresNear(place);
    const saved = savedKeys.includes(place.saveKey);
    return <article className={`mc-place ${nearby.length ? "affected" : ""}`} key={place.saveKey}>
      <div className="mc-place-info">
        <b>{place.name}</b>
        <small>{place.detail}</small>
        {place.hours && <small>{place.hours}</small>}
        {nearby.map((closure) => <span className="mc-place-alert" key={closure.id}><Icon name="alert" size={13} /> {closure.pathway} closed{closure.detour ? ` · ${closure.detour}` : ""}</span>)}
      </div>
      <div className="mc-place-actions">
        {place.status && <span className={`cms-badge ${statusTone(place.status)}`}>{place.status}</span>}
        <button type="button" onClick={() => onShowMap(place)} aria-label={`Show ${place.name} on the 2D floor plan`}><Icon name="route" size={14} /> 2D map</button>
        {place.mapKey && place.building === BUILDING_NAME && <button type="button" onClick={() => onShow3D(place)} aria-label={`Show ${place.name} in 3D`}><Icon name="cube" size={14} /> 3D</button>}
        {showSave
          ? <button type="button" className={saved ? "saved" : ""} onClick={() => toggleSaved(place)} aria-pressed={saved}>{saved ? "Saved" : "Save"}</button>
          : <button type="button" className="remove" onClick={() => toggleSaved(place)} aria-label={`Remove ${place.name} from saved places`}>Remove</button>}
      </div>
    </article>;
  };

  return (
    <div className="student-portal-shell" role="dialog" aria-modal="true" aria-labelledby="my-campus-title">
      <header className="student-portal-header"><a className="student-portal-brand" href="#about" onClick={onClose}><span className="brand-mark" /><span><b>SAINT SIMON OF CYRENE ACADEMY, INC.</b><small>MY CAMPUS</small></span></a><div className="student-header-tools"><span className={`connectivity-pill ${online ? "online" : "offline"}`}><i /><span className="connectivity-full">{online ? "Online · live campus updates" : "Offline · updates paused"}</span><span className="connectivity-short">{online ? "Online" : "Offline"}</span></span><button className="student-close" onClick={onClose} aria-label="Close My Campus"><Icon name="close" /></button></div></header>
      <main className="student-dashboard">
        <section className="student-welcome">
          <div><p className="kicker">MY CAMPUS</p><h1 id="my-campus-title">Hello, {firstName}</h1><p>Your saved places, route alerts, and campus updates in one place.</p></div>
          <div className={`checkin-card mc-route-status ${affectedPlaces.length ? "alert" : "clear"}`}>
            <span className="mc-status-dot" />
            <div><small>YOUR ROUTES TODAY</small><b>{affectedPlaces.length ? `${affectedPlaces.length} saved place${affectedPlaces.length === 1 ? " has" : "s have"} a closure nearby` : savedPlaces.length ? "All your saved places are reachable" : "Save places to get route alerts"}</b><span>{activeClosures.length ? `${activeClosures.length} pathway restriction${activeClosures.length === 1 ? "" : "s"} on campus` : "No pathway restrictions on campus"}</span></div>
          </div>
        </section>
        {profileError && <p className="updates-unavailable" role="alert">{profileError}</p>}
        <div className="student-dashboard-grid">
          <section className="student-card mc-find-card">
            <div className="student-card-heading"><div><p className="kicker">FIND A PLACE</p><h2>Where do you need to go?</h2></div></div>
            {myClassroom && <div className="mc-my-classroom"><p className="kicker">YOUR CLASSROOM</p>{placeRow(mapRow(myClassroom), { showSave: false, mine: true })}</div>}
            <input className="directory-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type a room like 304, or the clinic, the library…" aria-label="Search rooms and offices" autoFocus />
            <div className="mc-place-list">
              {term
                ? results.length ? results.map((place) => placeRow(place, { showSave: true })) : <p className="updates-empty">No rooms or offices match “{search.trim()}”.</p>
                : <p className="updates-empty">{`Search ${mapPlaces.length} rooms and offices. See each one on the 2D map or in 3D, and save the ones you visit often.`}</p>}
            </div>
          </section>
          <section className="student-card mc-alerts-card">
            <div className="student-card-heading"><div><p className="kicker">ROUTE ALERTS</p><h2>Closed pathways</h2></div><span className="pending-badge">{prefs.allClosureAlerts ? "Whole campus" : "My places only"}</span></div>
            <div className="mc-place-list">
              {alertList.length ? alertList.map((item) => <div className="closure-item" key={item.id}>
                <b>{item.pathway}</b>
                <small>{item.building} · {floorLabel(item.floor)} · {item.reason}{item.endDate ? ` · until ${item.endDate}` : ""}</small>
                {item.detour && <span><Icon name="route" size={14} /> {item.detour}</span>}
              </div>) : <p className="updates-empty">{closures.loading ? "Checking pathways…" : prefs.allClosureAlerts ? "All campus pathways are open." : "No closures near your saved places."}</p>}
            </div>
          </section>
          <section className="student-card mc-saved-card">
            <div className="student-card-heading"><div><p className="kicker">SAVED TO YOUR ACCOUNT</p><h2>My places</h2></div><span className="pending-badge">{savedPlaces.length} / {MAX_SAVED_PLACES}</span></div>
            <div className="mc-place-list">
              {savedPlaces.length ? savedPlaces.map((place) => placeRow(place, { showSave: false })) : <p className="updates-empty">{profile === undefined && !profileError ? "Loading your places…" : "Nothing saved yet. Search for a room or office above and tap Save. Your places follow you on any device you sign in to."}</p>}
            </div>
          </section>
          <section className="student-card mc-prefs-card">
            <div className="student-card-heading"><div><p className="kicker">PREFERENCES</p><h2>How SSCAI NAVI helps you</h2></div></div>
            <label className="mc-field">I am a<select value={role} onChange={(event) => update({ role: event.target.value })}>{USER_ROLES.map((item) => <option key={item}>{item}</option>)}</select></label>
            {role === "Student" && <div className="mc-grade">
              <label className="mc-field">Grade level<select value={gradeLevel} onChange={(event) => update({ gradeLevel: event.target.value, section: "" })}><option value="">Choose…</option>{GRADE_LEVELS.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="mc-field">Section<input value={sectionDraft ?? section} maxLength={MAX_SECTION_LENGTH} list="mc-sections" placeholder={sectionsOf(gradeLevel)[0] ? `e.g. ${sectionsOf(gradeLevel)[0]}` : "Your section"} onChange={(event) => setSectionDraft(event.target.value)} onBlur={() => { if (sectionDraft !== null && sectionDraft.trim() !== section) update({ section: sectionDraft.trim() }); setSectionDraft(null); }} /></label>
              <datalist id="mc-sections">{sectionsOf(gradeLevel).map((item) => <option key={item} value={item} />)}</datalist>
              {gradeLevel && section && !myClassroom && <small className="mc-grade-note">Your classroom isn&apos;t on the floor plan yet, so it can&apos;t be shown.</small>}
            </div>}
            <label className="mc-toggle"><input type="checkbox" checked={prefs.speakAnswers} onChange={(event) => update({ prefs: { ...prefs, speakAnswers: event.target.checked } })} /><span><b>Read SiBot answers aloud</b><small>SiBot speaks every answer, not only voice questions.</small></span></label>
            <label className="mc-toggle"><input type="checkbox" checked={prefs.allClosureAlerts} onChange={(event) => update({ prefs: { ...prefs, allClosureAlerts: event.target.checked } })} /><span><b>Show closures across the whole campus</b><small>Turn off to only see closures near your saved places.</small></span></label>
            {user.email && !confirmed && <div className="mc-toggle mc-confirm" role="group" aria-label="Confirm your email">
              <span><b>Confirm your email to get updates</b><small>We sent a link to {user.email}. Open it, then tap &ldquo;I&apos;ve confirmed&rdquo;.{confirmNote && ` ${confirmNote}`}</small>
                <span className="mc-confirm-actions"><button type="button" onClick={checkConfirmed}>I&apos;ve confirmed</button><button type="button" onClick={resendConfirmation}>Send the link again</button></span></span>
            </div>}
            {user.email && confirmed && <label className="mc-toggle"><input type="checkbox" checked={emailUpdates} onChange={(event) => {
              const enabled = event.target.checked;
              setEmailUpdatesState(enabled);
              setEmailUpdates(user, name, enabled).catch(() => {
                setEmailUpdatesState(!enabled);
                setProfileError("Your email setting could not be saved. Check your connection and try again.");
              });
            }} /><span><b>Email me announcements and closed hallways</b><small>Sent to {user.email} when the school posts an update.</small></span></label>}
          </section>
          <section className="student-card announcements-card">
            <div className="student-card-heading"><div><p className="kicker">SCHOOL BROADCAST</p><h2>Announcements</h2></div></div>
            {notices.length ? notices.map((item) => <article className="announcement-item" key={item.id}><span><Icon name="sparkle" size={16} /></span><div><div><b>{item.title}</b><small>{item.pinned ? "Pinned" : item.updatedAt?.toDate?.().toLocaleDateString("en-US", { month: "short", day: "numeric" }) || "School notice"}</small></div><p>{item.body}</p></div></article>) : <p className="updates-empty">{announcements.loading ? "Loading announcements…" : "No announcements right now."}</p>}
          </section>
        </div>
        <footer className="student-portal-footer"><a className="student-portal-brand footer-brand" href="#about" onClick={onClose}><span className="brand-mark" /><span><b>SAINT SIMON OF CYRENE ACADEMY, INC.</b><small>MY CAMPUS</small></span></a><div className="student-footer-account"><div><b>{name}</b><span>{role}</span></div><button onClick={onSignOut}>Sign out <Icon name="arrow" size={15} /></button></div></footer>
      </main>
      {renderAssistant?.(prefs)}
    </div>
  );
}
