import { VOYAGE, voyageAt } from "./ocean-fishing.js"
import { formatDate } from "./time.js"

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * @typedef {object} RecurringTimer Fires every `every` ms, at Unix epoch + `offset`
 * @property {"recurring"} kind
 * @property {string} id
 * @property {string} name
 * @property {number} every
 * @property {number} [offset] Unix epoch was a Thursday, so weekly offsets count from Thursday 00:00 UTC
 * @property {number} [window] Stays open this long after firing, shown as `windowName`
 * @property {string} [windowName]
 * @property {{ id: string, name: string, offset: number, info: string }[]} [regions] One card with a region picker
 * @property {boolean} [small]
 * @property {string} [info]
 * @property {string[]} [list]
 * @property {(start: number, now: number, region?: string) => { note?: string, list: string[] }} [upcoming] What's
 * coming, from the time it fires next (or fired, while open): the details' list, and maybe a note on the card
 */

/**
 * @typedef {object} PhasedTimer Loops through `phases` in order, from `startTime`
 * @property {"phased"} kind
 * @property {string} id
 * @property {string} name
 * @property {number} startTime
 * @property {{ name: string, duration: number, info: string }[]} phases
 * @property {boolean} [small]
 */

/**
 * The timer cards, in page order: big cards first, the small ones fill the last row.
 * @type {(RecurringTimer | PhasedTimer)[]}
 */
export const TIMERS = [
  {
    kind: "phased",
    id: "housing",
    name: "Housing",
    startTime: 1653577200000,
    phases: [
      { name: "Application Period", duration: 5 * DAY, info: "During this time, you may place an entry into the housing lottery." },
      { name: "Results Period", duration: 4 * DAY, info: "During this time, you may accept a winning bid." }
    ]
  },
  {
    kind: "recurring",
    id: "weekly",
    name: "Weekly Reset",
    every: 7 * DAY,
    offset: 5 * DAY + 8 * HOUR, // Tuesday 08:00 UTC
    info: "On the weekly reset, the following resets:",
    list: [
      "Cap on latest Allagan tomestones",
      "Weekly repeatable quests",
      "Latest Savage raid tier reward eligibility",
      "Latest Alliance Raid reward eligibility",
      "Blue Mage/Masked Carnival Weekly Targets",
      "PvP Weekly Performance",
      "Challenge Log challenges",
      "New Wondrous Tails journal availability",
      "Faux Hollows availability",
      "Custom deliveries allowances/individual allowances",
      "Doman Enclave Reconstruction Effort donations",
      "Adventurer Squadron Priority mission",
      "Fashion Report Theme Reveal"
    ]
  },
  {
    kind: "recurring",
    id: "daily",
    name: "Daily Reset",
    every: DAY,
    offset: 15 * HOUR,
    info: "At this time, the following resets:",
    list: [
      "Allied society daily quest allowances",
      "Duty Roulette daily bonuses",
      "Daily repeatable quests",
      "Frontline Duty Availability",
      "Housing Message",
      "Mini Cactpot"
    ]
  },
  {
    kind: "recurring",
    id: "gc",
    name: "Grand Company Daily Reset",
    every: DAY,
    offset: 20 * HOUR,
    info: "At this time, the following resets:",
    list: [
      "Adventurer Squadron training allowances",
      "Grand Company Supply/Provisioning missions"
    ]
  },
  {
    kind: "recurring",
    id: "gates",
    name: "Gold Saucer GATEs",
    every: 20 * MINUTE,
    offset: 0, // Aligns with xx:00, xx:20, xx:40
    small: true,
    info: "Gold Saucer Active Time Maneuvers begin:",
    list: [
      "GATE registration opens",
      "A random Gold Saucer minigame spawns"
    ]
  },
  {
    kind: "recurring",
    id: "fashion_judging",
    name: "Fashion Report",
    every: 7 * DAY,
    offset: 1 * DAY + 8 * HOUR, // Friday 08:00 UTC
    small: true,
    info: "At this time, the Masked Rose begins judging:",
    list: ["Fashion Report judging begins"]
  },
  {
    kind: "recurring",
    id: "jumbo_cactpot",
    name: "Jumbo Cactpot",
    every: 7 * DAY,
    small: true,
    list: ["Jumbo Cactpot drawing", "Early bird bonus active for 1 hour"],
    regions: [
      jumboCactpot("eu", "EU", 2 * DAY + 19 * HOUR, "Chaos and Light"), // Saturday 19:00 UTC
      jumboCactpot("na", "NA", 3 * DAY + 2 * HOUR, "Aether, Primal, Crystal, and Dynamis"), // Sunday 02:00 UTC
      jumboCactpot("jp", "JP", 2 * DAY + 12 * HOUR, "Elemental, Gaia, Mana, and Meteor"), // Saturday 12:00 UTC
      jumboCactpot("oce", "OCE", 2 * DAY + 9 * HOUR, "Materia") // Saturday 09:00 UTC
    ]
  },
  {
    kind: "recurring",
    id: "ocean_fishing",
    name: "Ocean Fishing",
    every: VOYAGE,
    offset: 0, // Every even hour UTC
    window: 15 * MINUTE,
    windowName: "Boarding",
    small: true,
    info: "Boarding opens every even hour UTC for 15 minutes, the Indigo route from Dryskthota in Limsa Lominsa Lower Decks, the Ruby route from Kugane once Stormblood's main story is done (Endwalker's for Thavnair). Both leave at the same times, the next voyages with the time of day at each stop:",
    upcoming: (start, now) => {
      const stops = (voyage) => voyage.stops.map((s) => `${s.place} (${s.time})`).join(", ")
      return {
        list: Array.from({ length: 3 }, (_, i) => {
          const time = start + i * VOYAGE
          return `${formatDate(new Date(time), new Date(now))}\nIndigo: ${stops(voyageAt("indigo", time))}\nRuby: ${stops(voyageAt("ruby", time))}`
        })
      }
    }
  }
]

/**
 * @param {string} id
 * @param {string} name
 * @param {number} offset
 * @param {string} dcs The data centers drawing at this time
 */
function jumboCactpot(id, name, offset, dcs) {
  return { id, name, offset, info: `The weekly lottery numbers are drawn for ${dcs}:` }
}

/**
 * @typedef {object} TimerState What a card shows at a moment
 * @property {string} id
 * @property {string} title
 * @property {number} target What the countdown counts to
 * @property {string} targetLabel "Next at", "Closes at", "Ends at"
 * @property {boolean} open In its window (Ocean Fishing boarding)
 * @property {boolean} small
 * @property {string} info
 * @property {string[]} list
 * @property {object[]} regions
 * @property {string} [region] The picked region's id
 * @property {string} [note] On the card under the countdown, like the next phase
 */

/**
 * @param {RecurringTimer | PhasedTimer} timer
 * @param {number} now
 * @param {string} [regionId] For timers with regions, the first one when missing
 * @returns {TimerState}
 */
function getTimerState(timer, now, regionId) {
  if (timer.kind === "recurring") {
    const region = timer.regions && (timer.regions.find((r) => r.id === regionId) ?? timer.regions[0])
    const offset = region ? region.offset : timer.offset
    const last = Math.floor((now - offset) / timer.every) * timer.every + offset
    const open = !!timer.window && now < last + timer.window
    const upcoming = timer.upcoming?.(open ? last : last + timer.every, now, region?.id)

    return {
      id: timer.id,
      title: open ? `${timer.name}: ${timer.windowName}` : timer.name,
      target: open ? last + timer.window : last + timer.every,
      targetLabel: open ? "Closes at" : "Next at",
      open,
      small: !!timer.small,
      info: region ? region.info : timer.info,
      list: upcoming?.list ?? timer.list ?? [],
      regions: timer.regions ?? [],
      region: region?.id,
      note: upcoming?.note
    }
  }

  const total = timer.phases.reduce((sum, p) => sum + p.duration, 0)
  const elapsed = (((now - timer.startTime) % total) + total) % total

  let phaseStart = now - elapsed
  let index = 0
  while (phaseStart + timer.phases[index].duration <= now) {
    phaseStart += timer.phases[index].duration
    index++
  }

  const current = timer.phases[index]
  const next = timer.phases[(index + 1) % timer.phases.length]

  return {
    id: timer.id,
    title: `${timer.name}: ${current.name}`,
    target: phaseStart + current.duration,
    targetLabel: "Ends at",
    open: false,
    small: !!timer.small,
    info: current.info,
    list: [],
    regions: [],
    note: `Next: ${next.name}`
  }
}

/**
 * @param {number} now
 * @param {Record<string, string>} [regions] Timer id -> picked region id
 * @returns {TimerState[]}
 */
export const getAllTimerStates = (now, regions = {}) => TIMERS.map((timer) => getTimerState(timer, now, regions[timer.id]))
