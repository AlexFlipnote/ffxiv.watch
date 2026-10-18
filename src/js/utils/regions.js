import { load, store } from "./storage.js"

// Timer id -> picked region id, the homepage and the Gold Saucer page share them
const REGIONS_KEY = "regions"

/** @returns {Record<string, string>} */
function loadRegions() {
  try {
    return JSON.parse(load(REGIONS_KEY)) ?? {}
  } catch {
    return {}
  }
}

/**
 * The Jumbo Cactpot region on a first visit, from the time zone.
 * @returns {"eu" | "oce" | "jp" | "na"}
 */
function guessCactpotRegion() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""
  if (zone.startsWith("Europe/") || zone.startsWith("Africa/")) return "eu"
  if (zone.startsWith("Australia/") || zone === "Pacific/Auckland") return "oce"
  if (zone.startsWith("Asia/")) return "jp"
  return "na"
}

/** Timer id -> picked region id, change it with pickRegion. */
export const regions = { jumbo_cactpot: guessCactpotRegion(), ...loadRegions() }

/**
 * @param {string} timerId
 * @param {string} regionId
 */
export function pickRegion(timerId, regionId) {
  regions[timerId] = regionId
  store(REGIONS_KEY, JSON.stringify(regions))
}
