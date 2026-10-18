import { formatCountdown, formatDate } from "../js/utils/time.js"
import { readData } from "../render/html.js"
import { ogZone } from "../render/og.js"
import { FASHION_REPORT, gatesAfter, openTournaments, phaseAt, TOURNAMENT, tournaments } from "../js/utils/saucer.js"
import { getAllTimerStates, TIMERS } from "../js/utils/timers.js"

export const sources = ["js/utils/saucer.js", "js/utils/timers.js", "js/data/weather-art.json"]

// The rows each list shows, js/saucer.js writes as many as the build did
const GATE_ROWS = 3
const OPEN_ROWS = 3
const TOURNAMENT_ROWS = 3

/**
 * @param {number} target
 * @param {number} now
 * @returns {{ countdown: string }}
 */
const countdown = (target, now) => ({ countdown: formatCountdown(target - now) })

/**
 * The Gold Saucer's timers as of the build, for /gold-saucer/. They take the room the current ones will, so nothing
 * moves when js/saucer.js writes those in, and search engines read the GATE pools without running JS.
 */
export default () => {
  const now = Date.now()
  const [open] = openTournaments(now, 1)
  const tournament = phaseAt(TOURNAMENT, now)
  const fashion = phaseAt(FASHION_REPORT, now)
  const states = getAllTimerStates(now)
  const jumbo = states.find((t) => t.id === "jumbo_cactpot")
  const daily = states.find((t) => t.id === "daily")

  return {
    // Its loading screen with its name, like a weather zone's
    og: ogZone("The Gold Saucer", readData("weather-art.json")["The Gold Saucer"]),
    gates: gatesAfter(now, GATE_ROWS).map((gate) => ({
      // "XX:40", the slot rather than a time already gone by the time anyone reads it
      time: `XX:${String(new Date(gate.start).getUTCMinutes()).padStart(2, "0")}`,
      pool: gate.pool.map((g) => ({ name: g.name, where: g.where ?? false }))
    })),
    gate: countdown(gatesAfter(now, 1)[0].start, now),
    open: { ...countdown(open.open ? open.end : open.start, now), state: open.open ? "Registration closes in" : "Registration opens in" },
    openRows: openTournaments(now, OPEN_ROWS).map((t) => ({ time: formatDate(new Date(t.start), new Date(now)), ruleset: t.ruleset })),
    tournament: { ...countdown(tournament.end, now), state: tournament.name === "Tournament" ? "Tournament ends in" : "Next tournament in", info: tournament.info },
    tournamentRows: tournaments(now, TOURNAMENT_ROWS).map((t) => ({
      time: `${formatDate(new Date(t.start), new Date(now))} - ${formatDate(new Date(t.end), new Date(t.start))}`
    })),
    fashion: { ...countdown(fashion.end, now), name: fashion.name, info: fashion.info },
    jumbo: {
      ...countdown(jumbo.target, now),
      regions: TIMERS.find((t) => t.id === "jumbo_cactpot").regions.map((r) => r.name),
      info: jumbo.info.replace(/:$/, ".")
    },
    mini: countdown(daily.target, now)
  }
}
