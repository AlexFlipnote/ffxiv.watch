// Sets <html data-time> by Eorzea time of day, the colors are in _daynight.scss

import { toEorzea } from "./eorzea.js"

const PHASES = [
  { name: "night", from: 0 },
  { name: "dawn", from: 5 },
  { name: "day", from: 8 },
  { name: "dusk", from: 17 },
  { name: "night", from: 20 }
]

function dayPhase(hour) {
  let phase = PHASES[0].name
  for (const p of PHASES) if (hour >= p.from) phase = p.name
  return phase
}

const root = document.documentElement

// Waits two frames so the current color is painted before transitions turn on
const enableFade = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("daynight-fade")))

/** Safe to call every tick, only touches the DOM when the phase changes (every few Earth minutes). */
export function applyDayNight(now) {
  const phase = dayPhase(toEorzea(now).hours)
  if (root.dataset.time === phase) return

  const first = !root.dataset.time
  root.dataset.time = phase

  // Skip the fade on page load
  if (first) enableFade()
}

// A fade started in a hidden tab can get stuck on the old color, so it's off while hidden
// and coming back snaps straight to the current phase
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    root.classList.remove("daynight-fade")
  } else {
    applyDayNight(Date.now())
    enableFade()
  }
})
