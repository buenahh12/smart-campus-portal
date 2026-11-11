import { useEffect, useState } from "react";
import Icon from "./Icon";
import { usePublicCollection, visibleAnnouncements } from "./CampusUpdates";
import { CMS_COLLECTIONS, GRADE_LEVELS, MAX_SAVED_PLACES, MAX_SECTION_LENGTH, USER_ROLES, isClosureActive, placeKey, saveProfile, setEmailUpdates, watchProfile, watchSubscription } from "./cms";
import { MAX_SAVED_ROUTES, parseRouteId } from "./savedRoutes";
import { BUILDING_NAME, PLACES, blockedAreas, buildingOf, findRoute, classroomOf, floorLabel as planFloorLabel, placeByKey, placeTitle, sectionsOf } from "./floorPlans";
import { searchPlace } from "./placeSearch";
import { openFeedback } from "./Feedback";
import { refreshEmailConfirmed, sendConfirmationEmail, wantsEmailUpdates, wishForEmailUpdates } from "./firebase";

const floorLabel = (floor) => (floor === 0 ? "Ground floor" : `Floor ${floor}`);
const TYPE_LABELS = { classroom: "Classroom", office: "Office", lab: "Laboratory", facility: "Facility", cr: "Comfort room", exit: "Exit" };
// A floor-plan place as a My Campus row. Saved as "map:<key>" next to older directory entries.
const mapRow = (place) => ({ saveKey: `map:${place.key}`, mapKey: place.key, name: placeTitle(place), floor: place.floor, building: buildingOf(place.floor), detail: `${TYPE_LABELS[place.type] || "Place"} · ${planFloorLabel(place.floor)}` });
// A leafy branch drawn along the edge of the page: long soft leaves in grey-green, each with a
// light midrib. Decoration only (hidden from screen readers, never in the way of a tap).
const BRANCH_LEAVES = [
  [64, 70, -62, 1.0], [58, 130, 205, 0.95], [52, 195, -55, 1.05], [47, 262, 215, 1.0], [43, 330, -48, 1.1],
  [40, 398, 222, 1.0], [38, 466, -42, 0.95], [37, 532, 228, 0.9], [38, 596, -38, 0.85],
];
function Branch({ className }) {
  return <svg className={`mc-branch ${className}`} viewBox="0 0 180 680" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${className}-leaf`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#7d8a6c" />
        <stop offset="0.55" stopColor="#a7b29a" />
        <stop offset="1" stopColor="#c9cfbd" />
      </linearGradient>
    </defs>
    <path className="mc-branch-stem" d="M70 0 C66 160 50 330 40 470 C34 560 38 620 40 680" />
    {BRANCH_LEAVES.map(([x, y, angle, size]) => <g key={y} transform={`translate(${x} ${y}) rotate(${angle}) scale(${size})`}>
      <path d="M0 0 C18 -15 62 -17 104 0 C62 15 18 13 0 0Z" fill={`url(#${className}-leaf)`} />
      <path className="mc-branch-rib" d="M3 0 C35 -2 70 -2 100 0" />
    </g>)}
  </svg>;
}

// The welcome questions on a first sign-in. Answers go to the profile (role, and for students
// grade level and section); they can be changed later under Preferences.
const WELCOME_ROLES = [
  { role: "Student", icon: "book", hint: "Nursery to Grade 12" },
  { role: "Faculty / Staff", icon: "building", hint: "Teachers and school staff" },
  { role: "Parent / Guardian", icon: "heart", hint: "Family of a learner" },
  { role: "Visitor", icon: "location", hint: "Here for a visit" },
];
function WelcomeQuestions({ firstName, onSave, onSkip }) {
  const [role, setRole] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [section, setSection] = useState("");
  const [saving, setSaving] = useState(false);
  const finish = async (answers) => {
    setSaving(true);
    await onSave(answers);
    setSaving(false);
  };
  const choose = (picked) => {
    if (picked === "Student") setRole(picked);
    else finish({ role: picked });
  };
  return <div className="mc-welcome" role="dialog" aria-modal="true" aria-labelledby="mc-welcome-title">
    <div className="mc-welcome-card">
      {role !== "Student" ? <>
        <p className="kicker">{"// WELCOME TO SSCAI NAVI"}</p>
        <h2 id="mc-welcome-title">Hi, {firstName}! Who are you?</h2>
        <p className="mc-welcome-lead">Pick one, so SSCAI NAVI can help you better.</p>
        <div className="mc-welcome-roles">
          {WELCOME_ROLES.map((item) => <button key={item.role} type="button" onClick={() => choose(item.role)} disabled={saving}>
            <span className="mc-card-icon" aria-hidden="true"><Icon name={item.icon} size={22} /></span>
            <span><b>{item.role === "Faculty / Staff" ? "Faculty or staff" : item.role === "Parent / Guardian" ? "Parent or guardian" : item.role}</b><small>{item.hint}</small></span>
          </button>)}
        </div>
      </> : <>
        <p className="kicker">{"// ALMOST DONE"}</p>
        <h2 id="mc-welcome-title">What grade are you in?</h2>
        <p className="mc-welcome-lead">Your classroom can then show up first in My Campus.</p>
        <label className="mc-field">Grade level<select value={gradeLevel} onChange={(event) => { setGradeLevel(event.target.value); setSection(""); }} autoFocus><option value="">Choose your grade…</option>{GRADE_LEVELS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="mc-field">Section (optional)<input value={section} maxLength={MAX_SECTION_LENGTH} list="mc-welcome-sections" placeholder={sectionsOf(gradeLevel)[0] ? `e.g. ${sectionsOf(gradeLevel)[0]}` : "Your section"} onChange={(event) => setSection(event.target.value)} /></label>
        <datalist id="mc-welcome-sections">{sectionsOf(gradeLevel).map((item) => <option key={item} value={item} />)}</datalist>
        <div className="mc-welcome-actions">
          <button type="button" className="mc-welcome-back" onClick={() => setRole("")} disabled={saving}>Back</button>
          <button type="button" className="mc-welcome-done" disabled={!gradeLevel || saving} onClick={() => finish({ role: "Student", gradeLevel, section: section.trim() })}>{saving ? "Saving…" : "Done"}</button>
        </div>
      </>}
      <button type="button" className="mc-welcome-skip" onClick={onSkip} disabled={saving}>Skip for now</button>
    </div>
  </div>;
}

const statusTone = (status) => (status === "Available" ? "good" : status === "In use" ? "warn" : "bad");

// Personal navigation hub for signed-in users: saved places, route alerts for
// those places, and preferences, all stored on their account in Firestore.
export default function MyCampus({ user, onClose, onSignOut, onShowMap, onShow3D, onOpenRoute = () => {}, renderAssistant }) {
  const [profile, setProfile] = useState(); // undefined while loading, null if never saved
  const [profileError, setProfileError] = useState("");
  const [search, setSearch] = useState("");
  const [emailUpdates, setEmailUpdatesState] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
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
  // A first sign-in (no profile yet, or no role chosen): ask who they are.
  const [welcomeSkipped, setWelcomeSkipped] = useState(false);
  const needsWelcome = !user.isAnonymous && !welcomeSkipped && (profile === null || (profile && !profile.role));
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

  const [saving, setSaving] = useState(false);
  const update = async (changes) => {
    setProfileError("");
    setSaving(true);
    try {
      await saveProfile(user.uid, changes);
    } catch (error) {
      setProfileError(error?.code === "permission-denied"
        ? "Your account could not save this change. The Firestore rules may not be deployed yet."
        : "That change could not be saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  // Saved routes, checked against today's closures so a blocked one says so.
  const savedRouteIds = profile?.savedRoutes || [];
  const blockedNow = blockedAreas(activeClosures);
  const myRoutes = savedRouteIds.map((id) => {
    const { from, to } = parseRouteId(id);
    const start = placeByKey(from);
    const end = placeByKey(to);
    const route = start && end ? findRoute(from, to, blockedNow) : null;
    return { id, from, to, start, end, route };
  });
  const removeRoute = (id) => !saving && update({ savedRoutes: savedRouteIds.filter((item) => item !== id) });

  const toggleSaved = (place) => {
    if (saving) return;
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
      <Branch className="mc-branch-left" />
      <Branch className="mc-branch-right" />
      {needsWelcome && <WelcomeQuestions firstName={firstName} onSkip={() => setWelcomeSkipped(true)} onSave={(answers) => update({ ...(profile?.name ? {} : { name: (user.displayName || "").slice(0, 80) }), ...answers })} />}
      <main className="student-dashboard">
        <section className="student-welcome">
          <div><p className="kicker">{"// MY CAMPUS"}</p><h1 id="my-campus-title">Hello, <em>{firstName}</em>!</h1>{role === "Student" && gradeLevel && <span className="mc-grade-chip"><Icon name="book" size={15} /> {gradeLevel}{section ? ` · ${section}` : ""}</span>}<p>Your saved places, route alerts, and campus updates in one place.</p></div>
          <div className={`checkin-card mc-route-status ${affectedPlaces.length ? "alert" : "clear"}`}>
            <span className="mc-status-dot" />
            <div><small>YOUR ROUTES TODAY</small><b>{affectedPlaces.length ? `${affectedPlaces.length} saved place${affectedPlaces.length === 1 ? " has" : "s have"} a closure nearby` : savedPlaces.length ? "All your saved places are reachable" : "Save places to get route alerts"}</b><span>{activeClosures.length ? `${activeClosures.length} pathway restriction${activeClosures.length === 1 ? "" : "s"} on campus` : "No pathway restrictions on campus"}</span></div>
          </div>
        </section>
        {profileError && <p className="updates-unavailable" role="alert">{profileError}</p>}
        <div className="student-dashboard-grid">
          <section className="student-card mc-find-card tone-lime">
            <div className="student-card-heading"><span className="mc-card-icon" aria-hidden="true"><Icon name="location" size={22} /></span><div><p className="kicker">FIND A PLACE</p><h2>Where do you need to go?</h2></div></div>
            {myClassroom && <div className="mc-my-classroom"><p className="kicker">YOUR CLASSROOM</p>{placeRow(mapRow(myClassroom), { showSave: false, mine: true })}</div>}
            <input className="directory-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type a room like 304, or the clinic, the library…" aria-label="Search rooms and offices" autoFocus />
            <div className="mc-place-list">
              {term
                ? results.length ? results.map((place) => placeRow(place, { showSave: true })) : <p className="updates-empty">No rooms or offices match “{search.trim()}”.</p>
                : <p className="updates-empty">{`Search ${mapPlaces.length} rooms and offices. See each one on the 2D map or in 3D, and save the ones you visit often.`}</p>}
            </div>
          </section>
          <section className="student-card mc-alerts-card tone-orange">
            <div className="student-card-heading"><span className="mc-card-icon" aria-hidden="true"><Icon name="alert" size={22} /></span><div><p className="kicker">ROUTE ALERTS</p><h2>Closed pathways</h2></div><span className="pending-badge">{prefs.allClosureAlerts ? "Whole campus" : "My places only"}</span></div>
            <div className="mc-place-list">
              {alertList.length ? alertList.map((item) => <div className="closure-item" key={item.id}>
                <b>{item.pathway}</b>
                <small>{item.building} · {floorLabel(item.floor)} · {item.reason}{item.endDate ? ` · until ${item.endDate}` : ""}</small>
                {item.detour && <span><Icon name="route" size={14} /> {item.detour}</span>}
              </div>) : <p className="updates-empty">{closures.loading ? "Checking pathways…" : prefs.allClosureAlerts ? "All campus pathways are open." : "No closures near your saved places."}</p>}
            </div>
          </section>
          <section className="student-card mc-saved-card tone-yellow">
            <div className="student-card-heading"><span className="mc-card-icon" aria-hidden="true"><Icon name="heart" size={22} /></span><div><p className="kicker">SAVED TO YOUR ACCOUNT</p><h2>My places</h2></div><span className="pending-badge">{savedPlaces.length} / {MAX_SAVED_PLACES}</span></div>
            <div className="mc-place-list">
              {savedPlaces.length ? savedPlaces.map((place) => placeRow(place, { showSave: false })) : <p className="updates-empty">{profile === undefined && !profileError ? "Loading your places…" : "Nothing saved yet. Search for a room or office above and tap Save. Your places follow you on any device you sign in to."}</p>}
            </div>
          </section>
          <section className="student-card mc-routes-card tone-lime">
            <div className="student-card-heading"><span className="mc-card-icon" aria-hidden="true"><Icon name="route" size={22} /></span><div><p className="kicker">SAVED TO YOUR ACCOUNT</p><h2>My routes</h2></div><span className="pending-badge">{myRoutes.length} / {MAX_SAVED_ROUTES}</span></div>
            <div className="mc-place-list">
              {myRoutes.length ? myRoutes.map(({ id, from, to, start, end, route }) => <article className={`mc-place mc-route ${route?.blocked ? "affected" : ""}`} key={id}>
                <div className="mc-place-info">
                  {start && end ? <b>{placeTitle(start)} <span aria-hidden="true">→</span><span className="sr-only"> to </span> {placeTitle(end)}</b> : <b>A place on this route is no longer on the map</b>}
                  {start && end && <small>{planFloorLabel(start.floor)} to {planFloorLabel(end.floor)}{route && !route.blocked ? ` · ${route.minutes} min · ${route.meters} m` : ""}</small>}
                  {route?.blocked && <span className="mc-place-alert"><Icon name="alert" size={13} /> Closed right now: no open way. Ask school staff.</span>}
                </div>
                <div className="mc-place-actions">
                  {start && end && <>
                    <button type="button" onClick={() => onOpenRoute("2d", from, to)} aria-label={`Open this route on the 2D floor plan`}><Icon name="route" size={14} /> 2D</button>
                    {buildingOf(start.floor) === BUILDING_NAME && buildingOf(end.floor) === BUILDING_NAME && <button type="button" onClick={() => onOpenRoute("3d", from, to)} aria-label="Open this route in 3D"><Icon name="cube" size={14} /> 3D</button>}
                    <button type="button" onClick={() => onOpenRoute("ar", from, to)} aria-label="Open this route in AR live view"><Icon name="scan" size={14} /> AR</button>
                  </>}
                  <button type="button" className="remove" onClick={() => removeRoute(id)} aria-label="Remove this saved route">Remove</button>
                </div>
              </article>) : <p className="updates-empty">{profile === undefined && !profileError ? "Loading your routes…" : "No saved routes yet. Open a route on the 2D floor plan, in 3D or in AR and tap ☆ Save route. It shows up here, on any device you sign in to."}</p>}
            </div>
          </section>
          <section className="student-card mc-prefs-card tone-sky">
            <div className="student-card-heading"><span className="mc-card-icon" aria-hidden="true"><Icon name="info" size={22} /></span><div><p className="kicker">PREFERENCES</p><h2>How SSCAI NAVI helps you</h2></div></div>
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
            {user.email && confirmed && <label className="mc-toggle"><input type="checkbox" checked={emailUpdates} disabled={emailSaving} onChange={(event) => {
              const enabled = event.target.checked;
              setEmailUpdatesState(enabled);
              setEmailSaving(true);
              setEmailUpdates(user, name, enabled).catch(() => {
                setEmailUpdatesState(!enabled);
                setProfileError("Your email setting could not be saved. Check your connection and try again.");
              }).finally(() => setEmailSaving(false));
            }} /><span><b>Email me announcements and closed hallways</b><small>Sent to {user.email} when the school posts an update.</small></span></label>}
            <button type="button" className="mc-feedback-button" onClick={() => openFeedback()}>Send feedback to the school</button>
          </section>
          <section className="student-card announcements-card tone-purple">
            <div className="student-card-heading"><span className="mc-card-icon" aria-hidden="true"><Icon name="sparkle" size={22} /></span><div><p className="kicker">SCHOOL BROADCAST</p><h2>Announcements</h2></div></div>
            {notices.length ? notices.map((item) => <article className="announcement-item" key={item.id}><span><Icon name="sparkle" size={16} /></span><div><div><b>{item.title}</b><small>{item.pinned ? "Pinned" : item.updatedAt?.toDate?.().toLocaleDateString("en-US", { month: "short", day: "numeric" }) || "School notice"}</small></div><p>{item.body}</p></div></article>) : <p className="updates-empty">{announcements.loading ? "Loading announcements…" : "No announcements right now."}</p>}
          </section>
        </div>
        <footer className="student-portal-footer"><a className="student-portal-brand footer-brand" href="#about" onClick={onClose}><span className="brand-mark" /><span><b>SAINT SIMON OF CYRENE ACADEMY, INC.</b><small>MY CAMPUS</small></span></a><div className="student-footer-account"><div><b>{name}</b><span>{role}</span></div><button onClick={onSignOut}>Sign out <Icon name="arrow" size={15} /></button></div></footer>
      </main>
      {renderAssistant?.(prefs)}
    </div>
  );
}
