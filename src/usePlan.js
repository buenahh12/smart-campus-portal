import { useSyncExternalStore } from "react";
import { applyMapOverrides, getPlanVersion, subscribePlan } from "./floorPlans";
import { CMS_COLLECTIONS, watchCollection } from "./cms";

// Keeps the floor plan's room names in sync with the mapRooms collection for the whole app.
// The first component that needs the plan starts one shared listener; edits made in the
// Content manager show up everywhere (map, search, directory, SiBot) without a reload.
let started = false;
let overrides = {};

function start() {
  if (started) return;
  started = true;
  watchCollection(CMS_COLLECTIONS.mapRooms, (items) => {
    overrides = Object.fromEntries(items.map((item) => [item.id, item]));
    applyMapOverrides(overrides);
  }, () => { /* offline or not configured: keep the built-in names */ });
}

export const getMapOverrides = () => overrides;

// Re-renders the calling component whenever room details change; returns a version number
// to use as a dependency for anything memoised from the plan.
export function usePlanVersion() {
  start();
  return useSyncExternalStore(subscribePlan, getPlanVersion);
}
