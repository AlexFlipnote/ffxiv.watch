import { load, onStored, store } from "./storage.js"

// Set before the first paint by partials/head.html, this keeps it in sync

const KEY = "effects"
const root = document.documentElement

/** @returns {"auto" | "full" | "light"} */
export function pickedEffects() {
  const effects = load(KEY)
  return effects === "full" || effects === "light" ? effects : "auto"
}

/** @param {"auto" | "full" | "light"} effects */
export const pickEffects = (effects) => store(KEY, effects === "auto" ? null : effects)

/**
 * Light at 4 GB of memory or less, partials/head.html has a copy
 * @returns {{ effects: "full" | "light", memory: number | undefined }} `memory` is undefined in Safari and Firefox
 */
export function autoEffects() {
  const memory = navigator.deviceMemory
  return { effects: memory <= 4 ? "light" : "full", memory }
}

function applyEffects() {
  const picked = pickedEffects()
  root.dataset.effects = picked === "auto" ? autoEffects().effects : picked
}

onStored(KEY, applyEffects)
applyEffects()
