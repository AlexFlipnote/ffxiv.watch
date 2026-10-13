import { formatCountdown } from "../../js/utils/time.js"
import { html, readData } from "../../render/html.js"

/**
 * @param {number} ms
 * @returns {string} "Thu 15 Oct, 08:00", in UTC, the script swaps it for the visitor's own time
 */
const utc = (ms) => new Date(ms).toLocaleString("en-GB", {
  weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC"
})

/**
 * An event's card, in the page for search engines and without the script. events.js fills in the countdown and moves
 * it between the sections as it starts and ends. The countdown as of the build holds its room until then. UTC is only
 * said without the script, so the line wraps where the visitor's own times will
 * @param {object} event One of lodestone.json's events
 * @param {number} now
 * @returns {import("../../render/html.js").Html}
 */
function eventCard(event, now) {
  const time = (ms) => html`<time datetime="${new Date(ms).toISOString()}">${utc(ms)}</time><span class="no-js"> UTC</span>`
  const end = event.end === null ? html`until Patch ${event.until}` : time(event.end)
  const [state, countdown] = event.start > now ? ["Starts in", formatCountdown(event.start - now)]
    : event.end === null ? ["Until", `Patch ${event.until}`]
      : ["Ends in", formatCountdown(event.end - now)]
  return html`
<article class="event-card" data-start="${event.start}" data-end="${event.end ?? ""}" data-until="${event.until ?? ""}">
  ${event.image && html`<a class="event-banner" href="${event.url}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true"><img src="${event.image}" width="720" height="188" alt="" loading="lazy"></a>`}
  <div class="event-body">
    <div class="event-head">
      <h3 class="event-title"><a href="${event.url}" target="_blank" rel="noopener">${event.name}</a></h3>
      <p class="event-countdown"><span class="detail-state">${state}</span> <strong>${countdown}</strong></p>
    </div>
    <p class="event-when">${time(event.start)} - ${end}</p>
    ${event.lead && html`<p class="event-lead" title="${event.lead}">${event.lead}</p>`}
  </div>
</article>`
}

export default () => {
  const now = Date.now()
  const { events } = readData("lodestone.json")
  const live = events.filter((e) => e.end === null || e.end > now)
  const on = live.filter((e) => e.start <= now)
  const soon = live.filter((e) => e.start > now)
  const hidden = (shown) => shown ? "" : " hidden"
  return {
    now: html`${on.map((e) => eventCard(e, now))}`,
    soon: html`${soon.map((e) => eventCard(e, now))}`,
    nowHidden: hidden(on.length),
    soonHidden: hidden(soon.length),
    emptyHidden: hidden(!live.length),
    sources: ["js/data/lodestone.json"]
  }
}
