import { ET_MINUTE_EARTH_MS, toEorzea } from "./eorzea.js"
import { load, onStored, store } from "./storage.js"

// The page's colors: the picked light or dark theme, and the day/night tint that follows Eorzea's time. Both are set
// before the first paint by the script in partials/head.html, this keeps them up to date

const KEY = "theme"
const root = document.documentElement
const system = matchMedia("(prefers-color-scheme: light)")
const themeColor = document.querySelector("meta[name=theme-color]")

const PHASES = [
  { name: "night", from: 0 },
  { name: "dawn", from: 5 },
  { name: "day", from: 8 },
  { name: "dusk", from: 17 },
  { name: "night", from: 20 }
]

/** @returns {"system" | "light" | "dark"} The picked one, "system" follows the device */
export function pickedTheme() {
  const theme = load(KEY)
  return theme === "light" || theme === "dark" ? theme : "system"
}

/** @param {"system" | "light" | "dark"} theme */
export const pickTheme = (theme) => store(KEY, theme === "system" ? null : theme)

// Two frames, so the current color is painted before transitions turn on
const enableFade = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("daynight-fade")))

function applyTheme() {
  const picked = pickedTheme()
  const theme = picked === "system" ? (system.matches ? "light" : "dark") : picked
  if (root.dataset.theme === theme) return

  // Instant, not through the 8s day/night fade
  const fading = root.classList.contains("daynight-fade")
  root.classList.remove("daynight-fade")
  root.dataset.theme = theme
  if (fading) enableFade()

  themeColor.content = theme === "light" ? "#f7f7f7" : "#1a1a1a"
}

/**
 * @param {number} hour ET hour
 * @returns {string} One of the PHASES names
 */
function dayPhase(hour) {
  let phase = PHASES[0].name
  for (const p of PHASES) if (hour >= p.from) phase = p.name
  return phase
}

function applyDayNight() {
  const phase = dayPhase(toEorzea(Date.now()).hours)
  if (root.dataset.time !== phase) root.dataset.time = phase
}

// Checked every Eorzean minute, on the minute
const dayNightLoop = () => {
  applyDayNight()
  setTimeout(dayNightLoop, ET_MINUTE_EARTH_MS - Date.now() % ET_MINUTE_EARTH_MS)
}

system.addEventListener("change", applyTheme)
onStored(KEY, applyTheme)
applyTheme()
dayNightLoop()
enableFade()

// A fade started in a hidden tab can get stuck, so it's off while hidden and snaps to the phase on return
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    root.classList.remove("daynight-fade")
  } else {
    applyDayNight()
    enableFade()
  }
})
