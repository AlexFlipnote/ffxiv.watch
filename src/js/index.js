import { maintenance as MAINTENANCE } from "./data/lodestone.json"
import "./utils/navbar.js"
import { closable } from "./utils/dialog.js"
import { ordinal, toEorzea } from "./utils/eorzea.js"
import { load, store } from "./utils/storage.js"
import { everyTick, formatCountdown, formatEnGB, gmtOffset, hour12, setText, setTime } from "./utils/time.js"
import { getAllTimerStates } from "./utils/timers.js"

const container = document.getElementById("timers")
const etTime = document.getElementById("et-time")
const etDate = document.getElementById("et-date")
const localTime = document.getElementById("local-time")
const localZone = document.getElementById("local-zone")
const serverTime = document.getElementById("server-time")
const modal = document.getElementById("modal")
const modalTitle = document.getElementById("modal-title")
const modalWhen = document.getElementById("modal-when")
const modalInfo = document.getElementById("modal-info")
const modalList = document.getElementById("modal-list")
const modalLink = document.getElementById("modal-link")

const MAINTENANCE_AHEAD = 7 * 24 * 60 * 60 * 1000
const maintenanceEl = document.getElementById("maintenance")
const [maintenanceStart, maintenanceEnd] = maintenanceEl.querySelectorAll(".maintenance-when time")
const maintenance = {
  el: maintenanceEl,
  name: maintenanceEl.querySelector(".maintenance-name"),
  patch: maintenanceEl.querySelector(".maintenance-patch"),
  start: maintenanceStart,
  end: maintenanceEnd,
  state: maintenanceEl.querySelector(".maintenance-countdown .detail-state"),
  countdown: maintenanceEl.querySelector(".maintenance-countdown strong")
}

// Timer id -> its card's elements
const cards = new Map()
let openId = null
let renderedModal = null

// Timer id -> picked region id
const REGIONS_KEY = "regions"
const regions = { jumbo_cactpot: guessCactpotRegion(), ...loadRegions() }

/** @returns {Record<string, string>} */
function loadRegions() {
  try {
    return JSON.parse(load(REGIONS_KEY)) ?? {}
  } catch {
    return {}
  }
}

const saveRegions = () => store(REGIONS_KEY, JSON.stringify(regions))

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
 * Hooks up a card the build wrote into the page (see src/pages/index.html).
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
    // The link's text when the title links to its own page, so the link stays
    title: card.querySelector(".title a") ?? card.querySelector(".title"),
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
  if (els.sideCol.hidden !== !timer.note) els.sideCol.hidden = !timer.note
  setText(els.next, timer.note ?? "")
  els.regionBtns.forEach((btn, i) => {
    const pressed = String(timer.regions[i].id === timer.region)
    if (btn.getAttribute("aria-pressed") !== pressed) btn.setAttribute("aria-pressed", pressed)
  })
}

/**
 * Fills the details modal, only when its content changed (like the housing phase flipping while open, or Ocean
 * Fishing's voyages dropping the day from their times at midnight).
 * @param {import("./utils/timers.js").TimerState} timer
 */
function renderModal(timer) {
  const key = `${timer.title}|${timer.list.join("|")}`
  if (renderedModal === key) return
  renderedModal = key

  modalTitle.textContent = timer.title
  modalWhen.textContent = timer.when ?? ""
  modalWhen.hidden = !timer.when
  modalInfo.textContent = timer.info
  modalList.replaceChildren(...timer.list.map((item) => {
    const li = document.createElement("li")
    li.textContent = item
    return li
  }))
  modalList.hidden = timer.list.length === 0
  modalLink.hidden = !timer.link
  if (timer.link) Object.assign(modalLink, { href: timer.link.url, textContent: timer.link.text })
}

/** @param {string} id Timer id */
function openModal(id) {
  openId = id
  renderModal(getAllTimerStates(Date.now(), regions).find((t) => t.id === id))
  modal.showModal()
}

modal.addEventListener("close", () => {
  openId = null
  renderedModal = null
})

closable(modal, document.getElementById("modal-close"))

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
 * @returns {string} "13:05:09", or "1:05:09 PM" on a 12-hour clock
 */
const timeOf = (date, utc) => formatEnGB(date, {
  ...(hour12() ? { hour: "numeric", hour12: true } : { hour: "2-digit", hour12: false }),
  minute: "2-digit",
  second: "2-digit",
  timeZone: utc ? "UTC" : undefined
})

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

/**
 * The maintenance bar, from a week before the next All Worlds maintenance until it's over.
 * @param {number} now
 */
function renderMaintenance(now) {
  const next = MAINTENANCE.find((m) => m.end > now && m.start - now < MAINTENANCE_AHEAD)
  maintenance.el.hidden = !next
  if (!next) return

  const started = next.start <= now
  maintenance.el.href = next.url
  maintenance.el.classList.toggle("on", started)
  // "All Worlds Maintenance (Oct. 12-13)", the bar gives the dates
  setText(maintenance.name, next.name.replace(/\s*\([^)]*\)$/, ""))
  setText(maintenance.patch, next.patch ? `Patch ${next.patch}` : "")
  setTime(maintenance.start, new Date(next.start), new Date(now))
  setTime(maintenance.end, new Date(next.end), new Date(now), { from: new Date(next.start) })
  setText(maintenance.state, started ? "Back in" : "Starts in")
  setText(maintenance.countdown, formatCountdown((started ? next.end : next.start) - now))
}

everyTick((now) => {
  render(now)
  renderEarthClock(now)
  renderEorzeaClock(now)
  renderMaintenance(now)
  // The build's countdowns are replaced, see src/pages/index.html
  document.querySelector(".timers-pending")?.classList.remove("timers-pending")
})
