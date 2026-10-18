const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** A GATE starts every 20 minutes, at :00, :20 and :40. */
export const GATE_EVERY = 20 * MINUTE

/**
 * The GATEs each slot of the hour picks one of at random, by the minute it starts at: :00, :20, :40. Air Force One
 * runs in two places, `where` tells them apart.
 * @type {{ name: string, where?: string }[][]}
 */
export const GATE_POOLS = [
  [{ name: "Air Force One", where: "The Cieldalaes" }, { name: "Cliffhanger" }, { name: "Leap of Faith" }],
  [{ name: "Any Way the Wind Blows" }, { name: "The Slice Is Right" }, { name: "Air Force One", where: "The Gold Saucer" }],
  [{ name: "The Slice Is Right" }, { name: "Leap of Faith" }, { name: "Air Force One", where: "The Cieldalaes" }]
]

/**
 * @param {number} time
 * @param {number} count
 * @returns {{ start: number, pool: { name: string, where?: string }[] }[]} The GATEs starting after `time`, in order
 */
export function gatesAfter(time, count) {
  const first = Math.floor(time / GATE_EVERY) + 1
  return Array.from({ length: count }, (_, i) => ({
    start: (first + i) * GATE_EVERY,
    // Unix time 0 was on the hour, so every third slot is a :00 one
    pool: GATE_POOLS[(first + i) % GATE_POOLS.length]
  }))
}

/** Open tournament registration opens every 2 hours, on odd hours UTC, for 30 minutes. */
export const OPEN_EVERY = 2 * HOUR
export const OPEN_WINDOW = 30 * MINUTE

/**
 * The open tournaments from the one `time` is in (or the next, between them), in order. Basic and Advanced take turns,
 * Advanced at 01:00, 05:00, 09:00 and so on UTC. The Advanced one's extra rules change, the game's schedule lists them.
 * @param {number} time
 * @param {number} count
 * @returns {{ start: number, end: number, open: boolean, ruleset: "Basic" | "Advanced" }[]}
 */
export function openTournaments(time, count) {
  const last = Math.floor((time - HOUR) / OPEN_EVERY) * OPEN_EVERY + HOUR
  const first = time < last + OPEN_WINDOW ? last : last + OPEN_EVERY
  return Array.from({ length: count }, (_, i) => {
    const start = first + i * OPEN_EVERY
    return {
      start,
      end: start + OPEN_WINDOW,
      open: start <= time && time < start + OPEN_WINDOW,
      ruleset: new Date(start).getUTCHours() % 4 === 1 ? "Advanced" : "Basic"
    }
  })
}

/**
 * @typedef {object} SaucerPhases Loops through `phases` in order, from `startTime`
 * @property {number} startTime
 * @property {{ name: string, duration: number, info: string }[]} phases
 */

/**
 * The Triple Triad tournament runs a week from the weekly reset, every other week. The Rowena Cup Classic ran from
 * Tuesday 13 October 2026, 08:00 UTC.
 * @type {SaucerPhases}
 */
export const TOURNAMENT = {
  startTime: Date.UTC(2026, 9, 13, 8),
  phases: [
    { name: "Tournament", duration: 7 * DAY, info: "Play your matches in the Battlehall at Card Square, the best scores take the top prizes." },
    { name: "Between tournaments", duration: 7 * DAY, info: "The last tournament's rankings are final, claim your prize from the Tournament Recordkeeper." }
  ]
}

/**
 * @param {number} time
 * @param {number} count
 * @returns {{ start: number, end: number }[]} The tournaments from the one running at `time` (or the next), in order
 */
export function tournaments(time, count) {
  const [running, between] = TOURNAMENT.phases.map((p) => p.duration)
  const cycle = running + between
  const last = TOURNAMENT.startTime + Math.floor((time - TOURNAMENT.startTime) / cycle) * cycle
  const first = time < last + running ? last : last + cycle
  return Array.from({ length: count }, (_, i) => ({ start: first + i * cycle, end: first + i * cycle + running }))
}

/**
 * The theme is revealed on the weekly reset, the Masked Rose judges from Friday until the next one.
 * @type {SaucerPhases}
 */
export const FASHION_REPORT = {
  startTime: Date.UTC(2026, 9, 13, 8),
  phases: [
    { name: "Theme revealed", duration: 3 * DAY, info: "This week's theme and hints are out, put your outfit together before judging starts." },
    { name: "Judging", duration: 4 * DAY, info: "Present your outfit to the Masked Rose, 80 points or more earns the full 60,000 MGP." }
  ]
}

/**
 * @param {SaucerPhases} timer
 * @param {number} time
 * @returns {{ name: string, info: string, start: number, end: number, next: string }} The phase `time` is in
 */
export function phaseAt(timer, time) {
  const total = timer.phases.reduce((sum, p) => sum + p.duration, 0)
  let start = timer.startTime + Math.floor((time - timer.startTime) / total) * total
  let index = 0
  while (start + timer.phases[index].duration <= time) start += timer.phases[index++].duration
  const phase = timer.phases[index]
  return { ...phase, start, end: start + phase.duration, next: timer.phases[(index + 1) % timer.phases.length].name }
}
