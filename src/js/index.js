import "./utils/navbar.js"
import { applyDayNight } from "./utils/daynight.js"
import { ordinal, toEorzea } from "./utils/eorzea.js"
import { formatCountdown, getAllTimerStates, gmtOffset, setTime } from "./utils/timers.js"
import { tick } from "./utils/tick.js"

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

// Timer id -> the elements that change every tick
const cards = new Map()
let openId = null

// Timer id -> chosen region id, saved between visits
const REGIONS_KEY = "regions"
const regions = { jumbo_cactpot: guessCactpotRegion(), ...loadRegions() }

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

// First visit: guess from the timezone
function guessCactpotRegion() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""
  if (zone.startsWith("Europe/") || zone.startsWith("Africa/")) return "eu"
  if (zone.startsWith("Australia/") || zone === "Pacific/Auckland") return "oce"
  if (zone.startsWith("Asia/")) return "jp"
  return "na"
}

function createCard(timer) {
  const card = document.createElement("div")
  card.className = timer.small ? "timer small" : "timer"
  card.innerHTML = `
    <div class="timer-header">
      <div class="title"></div>
      <button class="info-btn" title="Details">i</button>
    </div>
    <div class="timer-body">
      <div>
        <div class="countdown"></div>
        <div class="target"><strong></strong> <time></time></div>
      </div>
      <div class="side-col"><div class="sub-title"></div></div>
    </div>
  `

  card.querySelector(".info-btn").addEventListener("click", () => openModal(timer.id))

  const regionBtns = timer.regions.map((region) => {
    const btn = document.createElement("button")
    btn.className = "region-btn"
    btn.textContent = region.name
    btn.addEventListener("click", () => {
      regions[timer.id] = region.id
      saveRegions()
      render(Date.now())
    })
    return btn
  })

  if (regionBtns.length) {
    const picker = document.createElement("div")
    picker.className = "region-picker"
    picker.setAttribute("role", "group")
    picker.setAttribute("aria-label", "Region")
    picker.append(...regionBtns)
    card.querySelector(".timer-header").after(picker)
  }

  container.appendChild(card)

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

function updateCard(els, timer, now) {
  els.card.classList.toggle("open", timer.open)
  els.title.textContent = timer.title
  els.countdown.textContent = formatCountdown(timer.target - now)
  els.targetLabel.textContent = `${timer.targetLabel}:`
  setTime(els.targetDate, new Date(timer.target), new Date(now))
  els.sideCol.hidden = !timer.nextPhase
  els.next.textContent = timer.nextPhase ? `Next: ${timer.nextPhase}` : ""
  els.regionBtns.forEach((btn, i) => btn.setAttribute("aria-pressed", timer.regions[i].id === timer.region))
}

function renderModal(timer) {
  // Only rebuild when the content changed (e.g. housing phase flips while open)
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

function render(now) {
  for (const timer of getAllTimerStates(now, regions)) {
    if (!cards.has(timer.id)) cards.set(timer.id, createCard(timer))
    updateCard(cards.get(timer.id), timer, now)
    if (timer.id === openId) renderModal(timer)
  }
}

const pad = (n) => String(n).padStart(2, "0")
const timeOf = (date, utc) => (utc
  ? [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
  : [date.getHours(), date.getMinutes(), date.getSeconds()]
).map(pad).join(":")

function renderClock(now) {
  const et = toEorzea(now)
  const date = new Date(now)

  etTime.textContent = `${pad(et.hours)}:${pad(et.minutes)}`
  etDate.textContent = `${ordinal(et.sun)} Sun of the ${et.moonName}`
  localTime.textContent = timeOf(date, false)
  localZone.textContent = gmtOffset(date)
  serverTime.textContent = timeOf(date, true)
}

tick(1000, render)

// An Eorzean minute is under 3 Earth seconds, so the clock ticks faster than the timers
tick(250, (now) => {
  renderClock(now)
  applyDayNight(now)
})
