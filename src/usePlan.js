import { useSyncExternalStore } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { VISITOR_ROOMS, applyMapOverrides, getPlanVersion, setCustomFloors, subscribePlan } from "./floorPlans";
import { CMS_COLLECTIONS, watchCollection } from "./cms";
import { db } from "./firebase";
import { getCampusAccess, hasFullMap, onCampusAccess, startCampusAccess } from "./campusAccess";

// Keeps the floor plan in sync for the whole app: room names from the mapRooms collection and
// published floors added from blueprints (planFloors). The first component that needs the plan
// starts one shared listener; edits made in the Content manager show up everywhere (map, search,
// directory, SiBot, AR) without a reload.
//
// What is loaded depends on who is looking (src/campusAccess.js, enforced by firestore.rules):
// visitors get the room edits of the visitor rooms only, and no added floors; verified students,
// staff and the administrator get everything.
let started = false;
let overrides = {};
let fullMap = null;
let stops = [];

function listen(full) {
  if (full === fullMap) return;
  fullMap = full;
  stops.forEach((stop) => stop());
  stops = [];
  overrides = {};
  applyMapOverrides(overrides);
  const nothing = () => { /* offline or not allowed: keep what the map already shows */ };
  if (full) {
    stops.push(watchCollection(CMS_COLLECTIONS.mapRooms, (items) => {
      overrides = Object.fromEntries(items.map((item) => [item.id, item]));
      applyMapOverrides(overrides);
    }, nothing));
    stops.push(watchCollection(CMS_COLLECTIONS.planFloors, setCustomFloors, nothing, { publicOnly: true }));
  } else {
    setCustomFloors([]);
    if (!db) return;
    for (const id of VISITOR_ROOMS) {
      stops.push(onSnapshot(doc(db, CMS_COLLECTIONS.mapRooms, id), (snapshot) => {
        overrides = { ...overrides };
        if (snapshot.exists()) overrides[id] = { id, ...snapshot.data() };
        else delete overrides[id];
        applyMapOverrides(overrides);
      }, nothing));
    }
  }
}

function start() {
  if (started) return;
  started = true;
  startCampusAccess();
  const update = () => {
    const access = getCampusAccess();
    if (access.status !== "loading") listen(hasFullMap(access));
  };
  onCampusAccess(update);
  update();
}

export const getMapOverrides = () => overrides;

// Re-renders the calling component whenever the plan changes (room details or added floors);
// returns a version number to use as a dependency for anything memoised from the plan.
export function usePlanVersion() {
  start();
  return useSyncExternalStore(subscribePlan, getPlanVersion);
}
