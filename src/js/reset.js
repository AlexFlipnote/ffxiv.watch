import "./utils/navbar.js"
import { everyTick, formatCountdown, setText, setTime } from "./utils/time.js"
import { getAllTimerStates, phaseChanges, TIMERS } from "./utils/timers.js"

const now = document.querySelector(".reset-now")
const definition = TIMERS.find((t) => t.id === now.dataset.timer)
const state = now.querySelector(".reset-state")
const countdown = now.querySelector(".reset-countdown")
const at = now.querySelector("time")
// A phased timer's coming phase changes
const dates = document.querySelector(".reset-dates")

/** @param {number} time */
function fillDates(time) {
  dates.replaceChildren(...phaseChanges(definition, time, +dates.dataset.phases).map((change) => {
    const li = document.createElement("li")
    li.dataset.start = change.start
    li.append(Object.assign(document.createElement("strong"), { textContent: change.name }), " from ", document.createElement("time"))
    return li
  }))
}

let shownTarget = null
everyTick((time) => {
  const timer = getAllTimerStates(time).find((t) => t.id === definition.id)
  setText(countdown, formatCountdown(timer.target - time))
  setTime(at, new Date(timer.target), new Date(time))

  if (definition.kind !== "phased") return
  // "Housing: Results Period" -> "Results Period ends in"
  setText(state, `${timer.title.split(": ")[1]} ends in`)
  if (timer.target !== shownTarget) {
    shownTarget = timer.target
    fillDates(time)
  }
  for (const li of dates.children) setTime(li.querySelector("time"), new Date(+li.dataset.start), new Date(time))
})
