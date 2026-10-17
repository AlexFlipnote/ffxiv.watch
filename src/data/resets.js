import { TIMERS, zoneTimes } from "../js/utils/timers.js"

// The timers with a page of their own, Ocean Fishing's is its own page
const PAGES = ["weekly", "daily", "housing"]
const DAY = 24 * 60 * 60 * 1000

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
 * @returns {string} JSON for a <script>, where only "</script" could end it early
 */
function faq(timer) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [{ "@type": "Question", name: timer.question, acceptedAnswer: { "@type": "Answer", text: answer(timer) } }]
  }
  return JSON.stringify(data).replaceAll("<", "\\u003c")
}

/** A page per timer with one, see [resets.slug].html. */
export default () => PAGES.map((id) => TIMERS.find((t) => t.id === id)).map((timer) => {
  const name = timer.pageName ?? timer.name
  const phased = timer.kind === "phased"
  return {
    slug: timer.page.replaceAll("/", ""),
    id: timer.id,
    name,
    title: phased ? `FFXIV ${name} Schedule: Current Phase & Dates` : `FFXIV ${name} Time: Countdown & What Resets`,
    description: phased
      ? `${timer.when} A live countdown to the next phase, and the coming dates in your local time.`
      : `${timer.when.split(", which is")[0]}. A live countdown in your local time, the time around the world, and everything that resets.`,
    faq: faq(timer),
    when: timer.when,
    phased,
    // Filled in by js/reset.js: to the next reset, or to the end of the phase it's in
    countdown: phased ? "This phase ends in" : `Next ${timer.name.toLowerCase()} in`,
    list: timer.list ?? [],
    zones: phased ? [] : zoneTimes(timer),
    phases: (timer.phases ?? []).map((p) => ({ name: p.name, text: `${p.duration / DAY} days. ${p.info}` })),
    sources: ["js/utils/timers.js", "data/resets.js", "pages/[resets.slug].html"]
  }
})
