import { TIMERS } from "../js/utils/timers.js"
import { html, raw } from "../render/html.js"

/**
 * The timer cards as HTML, so search engines can read them without running JS. index.js finds them by data-id and
 * fills in the countdowns. The hidden details are the modal's text, for search engines only.
 * @param {object} timer One of TIMERS
 * @returns {import("../render/html.js").Html}
 */
function timerCard(timer) {
  const details = timer.phases?.map((phase) => html`<p>${phase.name}: ${phase.info}</p>`)
    ?? timer.regions?.map((region) => html`<p>${region.name}: ${region.when} ${region.info}</p>`)
    ?? html`<p>${timer.info}</p>`
  const when = timer.when && html`<p>${timer.when}</p>`
  const list = timer.list && html`<ul>${timer.list.map((item) => html`<li>${item}</li>`)}</ul>`
  const regions = timer.regions && html`
    <div class="region-picker" role="group" aria-label="Region">
      ${timer.regions.map((region) => html`<button class="region-btn">${region.name}</button>`)}
    </div>`

  return html`
<div class="${timer.small ? "timer small" : "timer"}" data-id="${timer.id}">
  <div class="timer-header">
    <h2 class="title">${timer.name}</h2>
    <button class="info-btn" title="Details" aria-label="Details about ${timer.name}">i</button>
  </div>${regions}
  <div class="timer-body">
    <div>
      <div class="countdown"></div>
      <div class="target"><strong></strong> <time></time></div>
    </div>
    <div class="side-col" hidden><div class="sub-title"></div></div>
  </div>
  <div class="timer-details" hidden>${when}${details}${list}</div>
</div>`
}

/**
 * @param {object} timer One of TIMERS
 * @returns {string} When it is and what happens, the details as one paragraph
 */
function answer(timer) {
  const list = timer.list ? ` ${timer.list.join(", ")}.` : ""
  const lines = timer.phases?.map((phase) => `${phase.name}: ${phase.info}`)
    ?? timer.regions?.map((region) => `${region.name}: ${region.when} ${region.info.replace(/:$/, ".")}`)
    // Ocean Fishing's info leads into its upcoming voyages, which change by the hour
    ?? (timer.upcoming ? [] : [`${timer.info}${list}`])
  return [timer.when, ...lines, timer.regions && list.trim()].filter(Boolean).join(" ")
}

/**
 * The timers' questions as FAQPage structured data, so search engines and AI answers can quote the times as answers.
 * @returns {import("../render/html.js").Html}
 */
function faq() {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: TIMERS.filter((timer) => timer.question).map((timer) => ({
      "@type": "Question",
      name: timer.question,
      acceptedAnswer: { "@type": "Answer", text: answer(timer) }
    }))
  }
  // In a <script>, where only "</script" could end it early
  return raw(`<script type="application/ld+json">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`)
}

export default () => ({
  timers: html`${TIMERS.map(timerCard)}`,
  faq: faq(),
  sources: ["js/utils/timers.js"]
})
