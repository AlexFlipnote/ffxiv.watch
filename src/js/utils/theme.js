import { ET_MINUTE_EARTH_MS, toEorzea } from "./eorzea.js"

// The page's colors: the picked light or dark theme, and the day/night tint that follows Eorzea's time. Both are set
// before the first paint by the script in partials/head.html, this keeps them up to date

const KEY = "theme"
const root = document.documentElement
const system = matchMedia("(prefers-color-scheme: light)")
const themeColor = document.querySelector("meta[name=theme-color]")
const button = document.querySelector(".theme-toggle")

const PHASES = [
  { name: "night", from: 0 },
  { name: "dawn", from: 5 },
  { name: "day", from: 8 },
  { name: "dusk", from: 17 },
  { name: "night", from: 20 }
]

/** @returns {string | null} The picked theme, if any */
function saved() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

// Two frames, so the current color is painted before transitions turn on
const enableFade = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("daynight-fade")))

/** @param {"light" | "dark"} theme */
function apply(theme) {
  // Instant, not through the 8s day/night fade
  const fading = root.classList.contains("daynight-fade")
  root.classList.remove("daynight-fade")
  root.dataset.theme = theme
  if (fading) enableFade()

  themeColor.content = theme === "light" ? "#f7f7f7" : "#1a1a1a"
  button.setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme")
  button.title = button.getAttribute("aria-label")
}

button.addEventListener("click", () => {
  const theme = root.dataset.theme === "light" ? "dark" : "light"
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Storage blocked, just not saved
  }
  apply(theme)
})

system.addEventListener("change", () => {
  if (!["light", "dark"].includes(saved())) apply(system.matches ? "light" : "dark")
})

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

apply(root.dataset.theme)
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
