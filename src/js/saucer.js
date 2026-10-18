import "./utils/navbar.js"
import { pickRegion, regions } from "./utils/regions.js"
import { FASHION_REPORT, gatesAfter, openTournaments, phaseAt, TOURNAMENT, tournaments } from "./utils/saucer.js"
import { everyTick, formatCountdown, setText, setTime } from "./utils/time.js"
import { getAllTimerStates, TIMERS } from "./utils/timers.js"

const JUMBO = TIMERS.find((t) => t.id === "jumbo_cactpot")

/**
 * A card's parts, see src/pages/gold-saucer/index.html.
 * @param {string} id
 */
function bindCard(id) {
  const card = document.getElementById(id)
  return {
    card,
    state: card.querySelector(".detail-state"),
    countdown: card.querySelector(".detail-countdown"),
    info: card.querySelector(".saucer-info"),
    phase: card.querySelector(".saucer-phase"),
    rows: card.querySelector(".saucer-rows"),
    // As many as the build wrote, see src/data/saucer.js
    count: card.querySelector(".saucer-rows")?.children.length ?? 0,
    // What the rows were last written for
    shown: null
  }
}

const gates = bindCard("gates")
const open = bindCard("open")
const tournament = bindCard("tournament")
const fashion = bindCard("fashion")
const jumbo = bindCard("jumbo")
const mini = bindCard("mini")

const regionBtns = [...jumbo.card.querySelectorAll(".region-btn")]
regionBtns.forEach((btn, i) => btn.addEventListener("click", () => {
  pickRegion(JUMBO.id, JUMBO.regions[i].id)
  render(Date.now())
}))

/**
 * @param {ReturnType<typeof bindCard>} els
 * @param {string} state
 * @param {number} target
 * @param {number} now
 */
function updateHead(els, state, target, now) {
  setText(els.state, state)
  setText(els.countdown, formatCountdown(target - now))
}

/**
 * Writes a card's rows, only when they're for something else than last time.
 * @param {ReturnType<typeof bindCard>} els
 * @param {string | number} key
 * @param {HTMLElement[]} rows
 */
function fillRows(els, key, rows) {
  if (els.shown === key) return
  els.shown = key
  els.rows.replaceChildren(...rows)
}

/**
 * @param {number} start
 * @param {(string | HTMLElement)[]} chips
 * @returns {HTMLLIElement} The row's time, its date filled in on each tick, and its chips
 */
function row(start, chips) {
  const li = document.createElement("li")
  li.dataset.start = start
  const list = Object.assign(document.createElement("span"), { className: "saucer-chips" })
  list.append(...chips)
  li.append(document.createElement("time"), list)
  return li
}

/**
 * @param {string} text
 * @param {string} [where] In smaller text after it
 * @returns {HTMLSpanElement}
 */
function chip(text, where) {
  const el = Object.assign(document.createElement("span"), { className: "chip", textContent: text })
  if (where) el.append(" ", Object.assign(document.createElement("span"), { className: "saucer-where", textContent: where }))
  return el
}

/** @param {number} now */
function render(now) {
  const nextGates = gatesAfter(now, gates.count)
  updateHead(gates, "Next GATE in", nextGates[0].start, now)
  fillRows(gates, nextGates[0].start, nextGates.map((g) => row(g.start, g.pool.map((p) => chip(p.name, p.where)))))

  const opens = openTournaments(now, open.count)
  open.card.classList.toggle("saucer-open", opens[0].open)
  updateHead(open, opens[0].open ? "Registration closes in" : "Registration opens in", opens[0].open ? opens[0].end : opens[0].start, now)
  fillRows(open, opens[0].start, opens.map((t) => row(t.start, [chip(t.ruleset)])))

  const phase = phaseAt(TOURNAMENT, now)
  const running = phase.name === TOURNAMENT.phases[0].name
  tournament.card.classList.toggle("saucer-open", running)
  updateHead(tournament, running ? "Tournament ends in" : "Next tournament in", phase.end, now)
  setText(tournament.info, `${phase.info} One runs a week from the weekly reset, every other week.`)
  const coming = tournaments(now, tournament.count)
  fillRows(tournament, coming[0].start, coming.map((t) => {
    const li = document.createElement("li")
    const range = Object.assign(document.createElement("span"), { className: "saucer-range" })
    range.append(document.createElement("time"), " - ", document.createElement("time"))
    li.dataset.start = t.start
    li.dataset.end = t.end
    li.append(range)
    return li
  }))

  const report = phaseAt(FASHION_REPORT, now)
  setText(fashion.phase, report.name)
  updateHead(fashion, "Ends in", report.end, now)
  setText(fashion.info, report.info)

  const states = getAllTimerStates(now, regions)
  const cactpot = states.find((t) => t.id === JUMBO.id)
  updateHead(jumbo, "Drawing in", cactpot.target, now)
  setText(jumbo.info, cactpot.info.replace(/:$/, "."))
  regionBtns.forEach((btn, i) => {
    const pressed = String(JUMBO.regions[i].id === cactpot.region)
    if (btn.getAttribute("aria-pressed") !== pressed) btn.setAttribute("aria-pressed", pressed)
  })

  updateHead(mini, "Resets in", states.find((t) => t.id === "daily").target, now)

  for (const li of document.querySelectorAll(".saucer-rows li[data-start]")) {
    const [start, end] = li.querySelectorAll("time")
    setTime(start, new Date(+li.dataset.start), new Date(now))
    if (end) setTime(end, new Date(+li.dataset.end), new Date(now), { from: new Date(+li.dataset.start) })
  }
}

everyTick((now) => {
  render(now)
  // The build's stand-ins are replaced, see src/data/saucer.js
  document.querySelector(".saucer-pending")?.classList.remove("saucer-pending")
})
