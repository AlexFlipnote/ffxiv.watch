// When each fish bites, what with and after which weather isn't in the game's data. Carbuncle Plushy's fish tracker
// (MIT) keeps it, for the fish with a condition and every big fish: https://github.com/icykoneko/ff14-fish-tracker-app
const TRACKER = "https://raw.githubusercontent.com/icykoneko/ff14-fish-tracker-app/master/js/app/data.js"

/**
 * The tracker's data is a script, `const DATA = { FISH: {...}, ... }`. Only its keys aren't JSON, so it's read as
 * that rather than run.
 * @returns {Promise<{ FISH: object, FOLKLORE: object }>}
 */
export async function trackerData() {
  const res = await fetch(TRACKER)
  if (!res.ok) throw new Error(`${TRACKER}: HTTP ${res.status}`)
  const text = await res.text()
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1).replace(/^(\s*)([A-Z_]+):/gm, "$1\"$2\":"))
}
