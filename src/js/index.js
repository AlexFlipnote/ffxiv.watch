import "./utils/navbar.js"
import { applyDayNight } from "./utils/daynight.js"
import { ordinal, toEorzea } from "./utils/eorzea.js"
import { formatCountdown, getAllTimerStates, gmtOffset, setTime } from "./utils/timers.js"
import { everyTick, setText } from "./utils/tick.js"

const container = document.getElementById("timers")
const etTime = document.getElementById("et-time")
const etDate = document.getElementById("et-date")
const localTime = document.getElementById("local-time")
const localZone = document.getElementById("local-zone")
const serverTime = document.getElementById("server-time")
const modal = document.getElementById("modal")
const modalTitle = document.getElementById("modal-title")
const modalInfo = document.getElementById("modal-info")
const modalList = document.getElementById("modal-list")

// Timer id -> its card's elements
const cards = new Map()
let openId = null

// Timer id -> picked region id
const REGIONS_KEY = "regions"
const regions = { jumbo_cactpot: guessCactpotRegion(), ...loadRegions() }

/** @returns {Record<string, string>} */
function loadRegions() {
  try {
    return JSON.parse(localStorage.getItem(REGIONS_KEY)) ?? {}
  } catch {
    return {}
  }
}

function saveRegions() {
  try {
    localStorage.setItem(REGIONS_KEY, JSON.stringify(regions))
  } catch {
    // Storage blocked, just not saved
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

/**
 * Hooks up a card the build wrote into the page (see timerCards in build.js).
 * @param {import("./utils/timers.js").TimerState} timer
 */
function bindCard(timer) {
  const card = container.querySelector(`[data-id="${timer.id}"]`)
  card.querySelector(".info-btn").addEventListener("click", () => openModal(timer.id))

  const regionBtns = [...card.querySelectorAll(".region-btn")]
  regionBtns.forEach((btn, i) => btn.addEventListener("click", () => {
    regions[timer.id] = timer.regions[i].id
    saveRegions()
    render(Date.now())
  }))

  return {
    card,
    regionBtns,
    title: card.querySelector(".title"),
    countdown: card.querySelector(".countdown"),
    targetLabel: card.querySelector(".target strong"),
    targetDate: card.querySelector(".target time"),
    sideCol: card.querySelector(".side-col"),
    next: card.querySelector(".sub-title")
  }
}

/**
 * @param {ReturnType<typeof bindCard>} els
 * @param {import("./utils/timers.js").TimerState} timer
 * @param {number} now
 */
function updateCard(els, timer, now) {
  els.card.classList.toggle("open", timer.open)
  setText(els.title, timer.title)
  setText(els.countdown, formatCountdown(timer.target - now))
  setText(els.targetLabel, `${timer.targetLabel}:`)
  setTime(els.targetDate, new Date(timer.target), new Date(now))
  if (els.sideCol.hidden !== !timer.nextPhase) els.sideCol.hidden = !timer.nextPhase
  setText(els.next, timer.nextPhase ? `Next: ${timer.nextPhase}` : "")
  els.regionBtns.forEach((btn, i) => {
    const pressed = String(timer.regions[i].id === timer.region)
    if (btn.getAttribute("aria-pressed") !== pressed) btn.setAttribute("aria-pressed", pressed)
  })
}

/**
 * Fills the details modal, only when its content changed (like the housing phase flipping while open).
 * @param {import("./utils/timers.js").TimerState} timer
 */
function renderModal(timer) {
  if (modalTitle.textContent === timer.title) return

  modalTitle.textContent = timer.title
  modalInfo.textContent = timer.info
  modalList.replaceChildren(...timer.list.map((item) => {
    const li = document.createElement("li")
    li.textContent = item
    return li
  }))
  modalList.hidden = timer.list.length === 0
}

/** @param {string} id Timer id */
function openModal(id) {
  openId = id
  renderModal(getAllTimerStates(Date.now(), regions).find((t) => t.id === id))
  modal.showModal()
}

modal.addEventListener("close", () => {
  openId = null
  modalTitle.textContent = ""
})

document.getElementById("modal-close").addEventListener("click", () => modal.close())

// Clicking the backdrop closes it
modal.addEventListener("click", (e) => {
  const rect = modal.getBoundingClientRect()
  if (e.clientY < rect.top || e.clientY > rect.bottom || e.clientX < rect.left || e.clientX > rect.right) {
    modal.close()
  }
})

/** @param {number} now */
function render(now) {
  for (const timer of getAllTimerStates(now, regions)) {
    if (!cards.has(timer.id)) cards.set(timer.id, bindCard(timer))
    updateCard(cards.get(timer.id), timer, now)
    if (timer.id === openId) renderModal(timer)
  }
}

const pad = (n) => String(n).padStart(2, "0")
/**
 * @param {Date} date
 * @param {boolean} utc
 * @returns {string} "13:05:09"
 */
const timeOf = (date, utc) => (utc
  ? [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
  : [date.getHours(), date.getMinutes(), date.getSeconds()]
).map(pad).join(":")

/** @param {number} now */
function renderEarthClock(now) {
  const date = new Date(now)

  setText(localTime, timeOf(date, false))
  setText(localZone, gmtOffset(date))
  setText(serverTime, timeOf(date, true))
}

/** @param {number} now */
function renderEorzeaClock(now) {
  const et = toEorzea(now)

  setText(etTime, `${pad(et.hours)}:${pad(et.minutes)}`)
  setText(etDate, `${ordinal(et.sun)} Sun of the ${et.moonName}`)
}

everyTick((now) => {
  render(now)
  renderEarthClock(now)
  renderEorzeaClock(now)
  applyDayNight(now)
})
