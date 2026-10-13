import { TIMERS, zoneTimes } from "../js/utils/timers.js"
import { html, raw } from "./html.js"

// The timers with a page of their own, Ocean Fishing's is its own page, see ocean.js
const PAGES = ["weekly", "daily", "housing"]
const DAY = 24 * 60 * 60 * 1000

/**
 * @param {object} timer One of TIMERS
 * @returns {string} What its page calls it, "Weekly Reset", "Housing Lottery"
 */
const pageName = (timer) => timer.pageName ?? timer.name

/**
 * @param {object} timer One of TIMERS
 * @returns {string} The answer to its question, everything its page says, in a sentence or two
 */
const answer = (timer) => timer.kind === "phased"
  ? `${timer.when} ${timer.phases.map((p) => `${p.name}: ${p.info}`).join(" ")}`
  : `${timer.when} ${timer.info} ${timer.list.join(", ")}.`

/**
 * The question and its answer as FAQPage structured data, like the homepage's, for search engines to quote.
 * @param {object} timer One of TIMERS
 * @returns {import("./html.js").Html}
 */
function faq(timer) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [{ "@type": "Question", name: timer.question, acceptedAnswer: { "@type": "Answer", text: answer(timer) } }]
  }
  // In a <script>, where only "</script" could end it early
  return raw(`<script type="application/ld+json">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`)
}

/**
 * The countdown, filled in by js/reset.js: to the next reset, or to the end of the phase it's in.
 * @param {object} timer One of TIMERS
 * @returns {import("./html.js").Html}
 */
const countdown = (timer) => html`
<section class="reset-now" data-timer="${timer.id}">
  <span class="detail-state reset-state">${timer.kind === "phased" ? "This phase ends in" : `Next ${timer.name.toLowerCase()} in`}</span>
  <strong class="reset-countdown"></strong>
  <span class="reset-at">Your time: <time></time></span>
</section>`

/**
 * A reset: what resets, and when around the world.
 * @param {object} timer One of TIMERS
 * @returns {import("./html.js").Html}
 */
const resetColumns = (timer) => html`
<div class="reset-columns">
  <section class="reset-card">
    <h2 class="detail-subtitle">What resets</h2>
    <ul class="reset-list">${timer.list.map((item) => html`
      <li>${item}</li>`)}
    </ul>
  </section>
  <section class="reset-card">
    <h2 class="detail-subtitle">Around the world</h2>
    <dl class="detail-facts reset-zones">
      ${zoneTimes(timer).map((z) => html`<dt>${z.zone}</dt><dd>${z.time}</dd>`)}
    </dl>
  </section>
</div>`

/**
 * A phased timer: its phases, and when they next begin, filled in by js/reset.js in the reader's time.
 * @param {object} timer One of TIMERS
 * @returns {import("./html.js").Html}
 */
const phaseColumns = (timer) => html`
<div class="reset-columns">
  <section class="reset-card">
    <h2 class="detail-subtitle">The phases</h2>
    <dl class="detail-facts reset-zones">
      ${timer.phases.map((p) => html`<dt>${p.name}</dt><dd>${p.duration / DAY} days. ${p.info}</dd>`)}
    </dl>
  </section>
  <section class="reset-card">
    <h2 class="detail-subtitle">Coming dates</h2>
    <ol class="reset-list reset-dates">${Array.from({ length: 6 }, () => html`<li><strong>&nbsp;</strong>&nbsp;</li>`)}</ol>
  </section>
</div>`

/** @returns {object[]} A page per timer with one, see [reset].data.js */
export function resetPages() {
  return PAGES.map((id) => TIMERS.find((t) => t.id === id)).map((timer) => ({
    slug: timer.page.replaceAll("/", ""),
    name: pageName(timer),
    title: timer.kind === "phased"
      ? `FFXIV ${pageName(timer)} Schedule: Current Phase & Dates`
      : `FFXIV ${pageName(timer)} Time: Countdown & What Resets`,
    description: timer.kind === "phased"
      ? `${timer.when} A live countdown to the next phase, and the coming dates in your local time.`
      : `${timer.when.split(", which is")[0]}. A live countdown in your local time, the time around the world, and everything that resets.`,
    faq: faq(timer),
    content: html`
<header class="detail-header">
  <h1 class="detail-title">FFXIV ${pageName(timer)}</h1>
  <p class="detail-text">${timer.when}</p>
</header>${countdown(timer)}${timer.kind === "phased" ? phaseColumns(timer) : resetColumns(timer)}`,
    sources: ["js/utils/timers.js", "render/resets.js"]
  }))
}
