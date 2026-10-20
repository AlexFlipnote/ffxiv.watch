import "./theme.js"
import { ALARMS_KEY, paintPill, readAlarms, savedNext } from "./alarmBells.js"
import { loadIndex, openSearch } from "./search.js"
import { openSettings } from "./settings.js"
import { onStored } from "./storage.js"

const navbar = document.querySelector(".navbar")
const hamburger = navbar.querySelector(".navbar-hamburger")
const more = navbar.querySelector(".navbar-more")
const moreButton = more.querySelector(".navbar-more-button")

/** @param {boolean} opened */
function setOpened(opened) {
  navbar.classList.toggle("opened", opened)
  hamburger.setAttribute("aria-expanded", opened)
}

hamburger.addEventListener("click", () => setOpened(!navbar.classList.contains("opened")))

/** @param {boolean} opened */
function setMoreOpened(opened) {
  more.classList.toggle("opened", opened)
  moreButton.setAttribute("aria-expanded", opened)
}

moreButton.addEventListener("click", () => setMoreOpened(!more.classList.contains("opened")))

// A click anywhere else closes the dropdown, like a select's
document.addEventListener("click", (e) => {
  if (!more.contains(e.target)) setMoreOpened(false)
})

// The backdrop covers the page while the menu is open, so a tap next to it only closes it
navbar.querySelector(".navbar-backdrop").addEventListener("click", () => setOpened(false))

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return
  setOpened(false)
  setMoreOpened(false)
})

navbar.querySelector(".settings-button").addEventListener("click", () => {
  setOpened(false)
  openSettings()
})

const searchButton = navbar.querySelector(".search-button")
searchButton.addEventListener("click", () => {
  setOpened(false)
  openSearch()
})

// Fetched on the way to a click, a failure shows once it opens
const preload = () => loadIndex().catch(() => {})
searchButton.addEventListener("pointerenter", preload, { once: true })
searchButton.addEventListener("focus", preload, { once: true })

// The pill from what the last page saved, so it's there before alarms.js loads
if (readAlarms().length) paintPill(readAlarms().length, savedNext(Date.now()), Date.now())

// Only loaded once there's an alarm, here or in another tab
const loadAlarms = () => readAlarms().length && import("./alarms.js")
loadAlarms()
onStored(ALARMS_KEY, loadAlarms)
