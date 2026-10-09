import { TIMERS } from "../js/utils/timers.js"
import { html } from "../render/html.js"

/**
 * The timer cards as HTML, so search engines can read them without running JS. index.js finds them by data-id and
 * fills in the countdowns. The hidden details are the modal's text, for search engines only.
 * @param {object} timer One of TIMERS
 * @returns {import("../render/html.js").Html}
 */
function timerCard(timer) {
  const details = timer.phases?.map((phase) => html`<p>${phase.name}: ${phase.info}</p>`)
    ?? timer.regions?.map((region) => html`<p>${region.name}: ${region.info}</p>`)
    ?? html`<p>${timer.info}</p>`
  const list = timer.list && html`<ul>${timer.list.map((item) => html`<li>${item}</li>`)}</ul>`
  const regions = timer.regions && html`
    <div class="region-picker" role="group" aria-label="Region">
      ${timer.regions.map((region) => html`<button class="region-btn">${region.name}</button>`)}
    </div>`

  return html`
<div class="${timer.small ? "timer small" : "timer"}" data-id="${timer.id}">
  <div class="timer-header">
    <h2 class="title">${timer.name}</h2>
    <button class="info-btn" title="Details">i</button>
  </div>${regions}
  <div class="timer-body">
    <div>
      <div class="countdown"></div>
      <div class="target"><strong></strong> <time></time></div>
    </div>
    <div class="side-col" hidden><div class="sub-title"></div></div>
  </div>
  <div class="timer-details" hidden>${details}${list}</div>
</div>`
}

export default () => ({
  timers: html`${TIMERS.map(timerCard)}`,
  sources: ["js/utils/timers.js"]
})
