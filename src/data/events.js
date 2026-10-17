import { formatCountdown } from "../js/utils/time.js"
import { readData } from "../render/html.js"

export const sources = ["js/data/lodestone.json"]

/**
 * @param {number} ms
 * @returns {string} "Thu 15 Oct, 08:00", in UTC, the script swaps it for the visitor's own time
 */
const utc = (ms) => new Date(ms).toLocaleString("en-GB", {
  weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC"
})

/**
 * An event as its card shows it, see partials/event-card.html. The countdown as of the build holds its room until
 * events.js fills it in.
 * @param {object} event One of lodestone.json's events
 * @param {number} now
 * @returns {object}
 */
function card(event, now) {
  const [state, countdown] = event.start > now ? ["Starts in", formatCountdown(event.start - now)]
    : event.end === null ? ["Until", `Patch ${event.until}`]
      : ["Ends in", formatCountdown(event.end - now)]
  return {
    ...event,
    endData: event.end ?? "",
    untilData: event.until ?? "",
    startIso: new Date(event.start).toISOString(),
    startText: utc(event.start),
    endIso: event.end !== null && new Date(event.end).toISOString(),
    endText: event.end !== null && utc(event.end),
    state,
    countdown
  }
}

/** The events on now and coming up, as of the build. */
export default () => {
  const now = Date.now()
  const live = readData("lodestone.json").events.filter((e) => e.end === null || e.end > now)
  const on = live.filter((e) => e.start <= now)
  const soon = live.filter((e) => e.start > now)
  return {
    on: on.map((e) => card(e, now)),
    soon: soon.map((e) => card(e, now)),
    noneOn: !on.length,
    noneSoon: !soon.length,
    anyLive: live.length > 0
  }
}
