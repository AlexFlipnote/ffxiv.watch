import { formatCountdown } from "../js/utils/time.js"
import { readData } from "../render/html.js"

export const sources = ["js/data/lodestone.json"]

/**
 * @param {number} ms
 * @returns {string} "Tue 13 Oct, 08:00", in UTC, the script swaps it for the visitor's own time
 */
const utc = (ms) => new Date(ms).toLocaleString("en-GB", {
  weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC"
})

/** The next maintenance as of the build, for the front page's bar, index.js keeps it up to date. Empty without one. */
export default () => {
  const now = Date.now()
  const next = readData("lodestone.json").maintenance.find((m) => m.end > now)
  const started = next?.start <= now
  return {
    class: started ? "maintenance on" : "maintenance",
    url: next?.url ?? null,
    start: next?.start ?? null,
    end: next?.end ?? null,
    name: next?.name.replace(/\s*\([^)]*\)$/, "") ?? "",
    patch: next?.patch ? `Patch ${next.patch}` : "",
    startIso: next ? new Date(next.start).toISOString() : null,
    startText: next ? utc(next.start) : "",
    endIso: next ? new Date(next.end).toISOString() : null,
    endText: next ? `${utc(next.end)} UTC` : "",
    state: next ? (started ? "Back in" : "Starts in") : "",
    countdown: next ? formatCountdown((started ? next.end : next.start) - now) : ""
  }
}
