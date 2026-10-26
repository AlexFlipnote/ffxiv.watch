import "./effects.js"
import "./theme.js"
import { ALARMS_KEY, paintStrip, readAlarms, savedNext } from "./alarmBells.js"
import { loadIndex, openSearch } from "./search.js"
import { openSettings } from "./settings.js"
import { onStored } from "./storage.js"

const navbar = document.querySelector(".navbar")
const hamburger = navbar.querySelector(".navbar-hamburger")
const more = navbar.querySelector(".navbar-more")
const moreButton = more.querySelector(".navbar-more-button")

/** @param {boolean} opened */
function setOpened(opened) {
  // How far the navbar's glass reaches down behind the menu, and where the dimmed page below it starts (_navbar.scss)
  if (opened) document.documentElement.style.setProperty("--menu-height", `${navbar.querySelector(".navbar-links").offsetHeight}px`)
  navbar.classList.toggle("opened", opened)
  hamburger.setAttribute("aria-expanded", opened)
  // For body::before, without :has() (Chromium before 105)
  document.body.classList.toggle("navbar-opened", opened)
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

// Firefox and Safari don't run the speculation rules in head.html, so a link held hovered like "moderate" there gets
// its page fetched here instead. The pages are cached for 10 minutes, so the click then takes it from the cache
if (!HTMLScriptElement.supports?.("speculationrules")) {
  // Safari has no rel=prefetch, a plain fetch fills the same cache
  const linkPrefetch = document.createElement("link").relList.supports("prefetch")
  const fetched = new Set()
  let timer

  /** @param {HTMLAnchorElement} a */
  const prefetch = (a) => {
    const url = a.href.split("#")[0]
    if (fetched.has(url)) return
    fetched.add(url)
    if (linkPrefetch) document.head.append(Object.assign(document.createElement("link"), { rel: "prefetch", href: url }))
    else fetch(url, { priority: "low" }).catch(() => {})
  }

  /** @param {Event} e */
  const linkOf = (e) => {
    const a = e.target.closest?.("a[href]")
    if (a && a.origin === location.origin && a.pathname !== location.pathname && !a.target && !a.hasAttribute("download")) return a
  }

  // The same 200ms Chrome waits, so moving the mouse across the page doesn't fetch every link it passes
  document.addEventListener("pointerover", (e) => {
    const a = linkOf(e)
    if (!a || e.pointerType === "touch") return
    clearTimeout(timer)
    timer = setTimeout(() => prefetch(a), 200)
  })
  document.addEventListener("pointerout", (e) => {
    if (linkOf(e)) clearTimeout(timer)
  })
  // A tap has no hover, this still starts it the moment before the click
  document.addEventListener("pointerdown", (e) => {
    const a = linkOf(e)
    if (a) prefetch(a)
  })
  document.addEventListener("focusin", (e) => {
    const a = linkOf(e)
    if (a) prefetch(a)
  })
}

// The strip from what the last page saved, so it's filled in before alarms.js loads
if (readAlarms().length) paintStrip(readAlarms().length, savedNext(Date.now()), Date.now())

// Only loaded once there's an alarm, here or in another tab
const loadAlarms = () => readAlarms().length && import("./alarms.js")
loadAlarms()
onStored(ALARMS_KEY, loadAlarms)
