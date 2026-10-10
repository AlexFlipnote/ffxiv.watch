import { clockNow } from "./clock.js"
import { toEorzea } from "./eorzea.js"

const PHASES = [
  { name: "night", from: 0 },
  { name: "dawn", from: 5 },
  { name: "day", from: 8 },
  { name: "dusk", from: 17 },
  { name: "night", from: 20 }
]

/**
 * @param {number} hour ET hour
 * @returns {string} One of the PHASES names
 */
function dayPhase(hour) {
  let phase = PHASES[0].name
  for (const p of PHASES) if (hour >= p.from) phase = p.name
  return phase
}

const root = document.documentElement

// Two frames, so the current color is painted before transitions turn on
const enableFade = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("daynight-fade")))

/**
 * Updates the day/night phase, partials/head.html sets the first one before the page paints.
 * Cheap to call every tick, only writes when the phase changes.
 * @param {number} now
 */
export function applyDayNight(now) {
  const phase = dayPhase(toEorzea(now).hours)
  if (root.dataset.time !== phase) root.dataset.time = phase
}

enableFade()

// A fade started in a hidden tab can get stuck, so it's off while hidden and snaps to the phase on return
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    root.classList.remove("daynight-fade")
  } else {
    applyDayNight(clockNow())
    enableFade()
  }
})
