import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { saveProfile, watchProfile } from "./cms";

// Saved routes: "From → To" pairs kept on the signed-in person's profile (users/{uid}.savedRoutes,
// see validProfile in firestore.rules), saved from the 2D map, 3D directions or AR live view and
// listed under "My routes" in My Campus. Each is stored as "<from key>~<to key>".

export const MAX_SAVED_ROUTES = 20;
export const routeId = (from, to) => `${from}~${to}`;
export const parseRouteId = (id) => {
  const [from = "", to = ""] = String(id).split("~");
  return { from, to };
};

// Asks the page to open the sign-in window (App listens and closes the map, 3D or AR first).
export const askToSignIn = () => window.dispatchEvent(new CustomEvent("sscai:login"));

export function useSavedRoutes() {
  const [user, setUser] = useState(() => auth?.currentUser || null);
  const [routes, setRoutes] = useState([]);
  useEffect(() => (auth ? onAuthStateChanged(auth, setUser) : undefined), []);
  const uid = user && !user.isAnonymous ? user.uid : "";
  useEffect(() => {
    if (!uid) {
      setRoutes([]);
      return undefined;
    }
    return watchProfile(uid, (profile) => setRoutes(profile?.savedRoutes || []), () => {});
  }, [uid]);
  const isSaved = (from, to) => routes.includes(routeId(from, to));
  const toggle = async (from, to) => {
    const id = routeId(from, to);
    const saved = routes.includes(id);
    if (!saved && routes.length >= MAX_SAVED_ROUTES) return "full";
    const next = saved ? routes.filter((item) => item !== id) : [id, ...routes];
    setRoutes(next);
    try {
      await saveProfile(uid, { savedRoutes: next });
      return saved ? "removed" : "saved";
    } catch {
      setRoutes(routes);
      return "error";
    }
  };
  return { signedIn: Boolean(uid), routes, isSaved, toggle };
}

const NOTES = {
  saved: "Saved to My routes in My Campus.",
  removed: "Removed from My routes.",
  full: `You can save up to ${MAX_SAVED_ROUTES} routes. Remove one in My Campus first.`,
  error: "Couldn't save right now. Check your connection and try again.",
};

// "Save route" for the route on screen. Signed out, it explains and offers to sign in.
export function SaveRouteButton({ from, to, className = "", noteClassName = "" }) {
  const { signedIn, isSaved, toggle } = useSavedRoutes();
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [from, to]);
  if (!from || !to || from === to) return null;
  const saved = signedIn && isSaved(from, to);
  const click = async () => {
    if (!signedIn) {
      setNote("signin");
      return;
    }
    setNote(await toggle(from, to));
  };
  return <>
    <button type="button" className={`save-route ${saved ? "saved" : ""} ${className}`} onClick={click} aria-pressed={saved}>
      <span aria-hidden="true">{saved ? "★" : "☆"}</span> {saved ? "Saved" : "Save route"}
    </button>
    {note && <p className={`save-route-note ${noteClassName}`} role="status">
      {note === "signin"
        ? <>Sign in to save routes to your account. <button type="button" onClick={askToSignIn}>Sign in</button></>
        : NOTES[note]}
    </p>}
  </>;
}
