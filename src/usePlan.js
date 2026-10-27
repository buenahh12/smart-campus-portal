import { useSyncExternalStore } from "react";
import { applyMapOverrides, getPlanVersion, setCustomFloors, subscribePlan } from "./floorPlans";
import { CMS_COLLECTIONS, watchCollection } from "./cms";

// Keeps the floor plan in sync for the whole app: room names from the mapRooms collection and
// published floors added from blueprints (planFloors). The first component that needs the plan
// starts one shared listener; edits made in the Content manager show up everywhere (map, search,
// directory, SiBot, AR) without a reload.
let started = false;
let overrides = {};

function start() {
  if (started) return;
  started = true;
  watchCollection(CMS_COLLECTIONS.mapRooms, (items) => {
    overrides = Object.fromEntries(items.map((item) => [item.id, item]));
    applyMapOverrides(overrides);
  }, () => { /* offline or not configured: keep the built-in names */ });
  watchCollection(CMS_COLLECTIONS.planFloors, setCustomFloors, () => { /* keep the built-in floors */ }, { publicOnly: true });
}

export const getMapOverrides = () => overrides;

// Re-renders the calling component whenever the plan changes (room details or added floors);
// returns a version number to use as a dependency for anything memoised from the plan.
export function usePlanVersion() {
  start();
  return useSyncExternalStore(subscribePlan, getPlanVersion);
}
