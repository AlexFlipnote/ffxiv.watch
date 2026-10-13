import { formatCountdown, formatDate } from "../js/utils/time.js"
import { getAllTimerStates, TIMERS } from "../js/utils/timers.js"
import { html, readData } from "../render/html.js"

/**
 * @param {number} ms
 * @returns {string} "Tue 13 Oct, 08:00", in UTC, the script swaps it for the visitor's own time
 */
const utc = (ms) => new Date(ms).toLocaleString("en-GB", {
  weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC"
})

/**
 * The timer cards as HTML, so search engines can read them without running JS. index.js finds them by data-id and
 * fills in the countdowns. The countdowns as of the build, hidden until then (.timers-pending), take the room the
 * current ones will, so nothing under them moves. The hidden details are the modal's text, for search engines only.
 * @param {object} timer One of TIMERS
 * @param {import("../js/utils/timers.js").TimerState} state Its state as of the build
 * @param {number} now
 * @returns {import("../render/html.js").Html}
 */
function timerCard(timer, state, now) {
  const details = timer.phases?.map((phase) => html`<p>${phase.name}: ${phase.info}</p>`)
    ?? timer.regions?.map((region) => html`<p>${region.name}: ${region.when} ${region.info}</p>`)
    ?? html`<p>${timer.info}</p>`
  const when = timer.when && html`<p>${timer.when}</p>`
  const list = timer.list && html`<ul>${timer.list.map((item) => html`<li>${item}</li>`)}</ul>`
  const link = timer.link && html`<p><a href="${timer.link.url}">${timer.link.text}</a></p>`
  const regions = timer.regions && html`
    <div class="region-picker" role="group" aria-label="Region">
      ${timer.regions.map((region) => html`<button class="region-btn">${region.name}</button>`)}
    </div>`

  return html`
<div class="${timer.small ? "timer small" : "timer"}" data-id="${timer.id}">
  <div class="timer-header">
    <h2 class="title">${timer.page ? html`<a href="${timer.page}">${timer.name}</a>` : timer.name}</h2>
    <button class="info-btn" title="Details" aria-label="Details about ${timer.name}">i</button>
  </div>${regions}
  <div class="timer-body">
    <div>
      <div class="countdown">${formatCountdown(state.target - now)}</div>
      <div class="target"><strong>${state.targetLabel}:</strong> <time>${formatDate(new Date(state.target), new Date(now))}</time></div>
    </div>
    <div class="side-col"${!state.note && html` hidden`}><div class="sub-title">${state.note}</div></div>
  </div>
  <div class="timer-details" hidden>${when}${details}${list}${link}</div>
</div>`
}

/**
 * The maintenance bar as index.js fills it, with the next maintenance as of the build, so it takes the same room. The
 * script after it in index.html shows it before the first paint, index.js then keeps it up to date.
 * @param {number} now
 * @returns {import("../render/html.js").Html}
 */
function maintenanceBar(now) {
  const next = readData("lodestone.json").maintenance.find((m) => m.end > now)
  const started = next?.start <= now
  const time = (ms, suffix = "") => ms
    ? html`<time datetime="${new Date(ms).toISOString()}">${utc(ms)}${suffix}</time>`
    : html`<time></time>`
  return html`<a class="${started ? "maintenance on" : "maintenance"}" id="maintenance"${next && html` href="${next.url}" data-start="${next.start}" data-end="${next.end}"`} target="_blank" rel="noopener" hidden>
  <span class="maintenance-title"><span class="maintenance-dot" aria-hidden="true"></span><strong class="maintenance-name">${next?.name.replace(/\s*\([^)]*\)$/, "")}</strong> <span class="maintenance-patch">${next?.patch && `Patch ${next.patch}`}</span></span>
  <span class="maintenance-when">${time(next?.start)} - ${time(next?.end, " UTC")}</span>
  <span class="maintenance-countdown"><span class="detail-state">${next && (started ? "Back in" : "Starts in")}</span> <strong>${next && formatCountdown((started ? next.end : next.start) - now)}</strong></span>
</a>`
}

export default () => {
  const now = Date.now()
  const states = getAllTimerStates(now)
  return {
    timers: html`${TIMERS.map((timer, i) => timerCard(timer, states[i], now))}`,
    maintenance: maintenanceBar(now),
    sources: ["js/utils/timers.js", "js/data/lodestone.json"]
  }
}
