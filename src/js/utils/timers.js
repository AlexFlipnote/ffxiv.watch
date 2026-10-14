import { formatDate, formatEnGB } from "./time.js"
import { VOYAGE, voyageAt } from "./voyages.js"

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
 * @property {{ id: string, name: string, offset: number, info: string, zones: string[], when?: string }[]} [regions] One
 * card with a region picker, zones are ZONES keys
 * @property {boolean} [small]
 * @property {string} [question] What people search for it, for the page's FAQ
 * @property {string} [when] When it fires, in words. Daily and weekly ones get it from `every` and `offset`
 * @property {string} [info]
 * @property {string[]} [list]
 * @property {{ url: string, text: string }} [link] A page with more, under the details
 * @property {string} [page] Its own page, the card's title links to it
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
 * @property {string} [page] Its own page, the card's title links to it
 * @property {string} [pageName] What its page calls it, when that's more than the card's name
 * @property {string} [question]
 * @property {string} [when]
 */

/**
 * The timer cards, in page order: big cards first, the small ones fill the last row.
 * @type {(RecurringTimer | PhasedTimer)[]}
 */
export const TIMERS = [
  {
    kind: "recurring",
    id: "weekly",
    name: "Weekly Reset",
    page: "/weekly-reset/",
    question: "When is the FFXIV weekly reset?",
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
      "Elite Mark Bills on the hunt boards",
      "Fashion Report Theme Reveal"
    ]
  },
  {
    kind: "recurring",
    id: "daily",
    name: "Daily Reset",
    page: "/daily-reset/",
    question: "When is the FFXIV daily reset?",
    every: DAY,
    offset: 15 * HOUR,
    info: "At this time, the following resets:",
    list: [
      "Allied society daily quest allowances",
      "Duty Roulette daily bonuses",
      "Daily repeatable quests",
      "Daily Mark Bills on the hunt boards",
      "Frontline Duty Availability",
      "Housing Message",
      "Mini Cactpot"
    ]
  },
  {
    kind: "phased",
    id: "housing",
    name: "Housing",
    page: "/housing-lottery/",
    pageName: "Housing Lottery",
    question: "When is the FFXIV housing lottery?",
    when: "The housing lottery runs in 9-day cycles: 5 days to place an entry, then 4 days to claim a winning plot.",
    startTime: 1653577200000,
    phases: [
      { name: "Application Period", duration: 5 * DAY, info: "During this time, you may place an entry into the housing lottery." },
      { name: "Results Period", duration: 4 * DAY, info: "During this time, you may accept a winning bid." }
    ]
  },
  {
    kind: "recurring",
    id: "ocean_fishing",
    name: "Ocean Fishing",
    question: "When is FFXIV Ocean Fishing?",
    when: "Every 2 hours, on even hours UTC (00:00, 02:00, 04:00 and so on), boarding is open for 15 minutes.",
    every: VOYAGE,
    offset: 0, // Every even hour UTC
    window: 15 * MINUTE,
    windowName: "Boarding",
    page: "/ocean-fishing/",
    link: { url: "/ocean-fishing/", text: "What bites at each stop, and more voyages" },
    info: "The Indigo route leaves from Dryskthota in Limsa Lominsa Lower Decks, the Ruby route from Kugane once Stormblood's main story is done (Endwalker's for Thavnair). Both leave at the same times, the next voyages with the time of day at each stop:",
    upcoming: (start, now) => {
      const stops = (voyage) => voyage.stops.map((s) => `${s.place} (${s.time})`).join(", ")
      return {
        list: Array.from({ length: 3 }, (_, i) => {
          const time = start + i * VOYAGE
          return `${formatDate(new Date(time), new Date(now))}\nIndigo: ${stops(voyageAt("indigo", time))}\nRuby: ${stops(voyageAt("ruby", time))}`
        })
      }
    }
  },
  {
    kind: "recurring",
    id: "gc",
    name: "Grand Company Daily Reset",
    question: "When do FFXIV Grand Company supply and provisioning missions reset?",
    every: DAY,
    offset: 20 * HOUR,
    small: true,
    info: "At this time, the following resets:",
    list: [
      "Adventurer Squadron training allowances",
      "Grand Company Supply/Provisioning missions"
    ]
  },
  {
    kind: "recurring",
    id: "leves",
    name: "Leve allowances",
    question: "When do FFXIV leve allowances refill?",
    when: "Every 12 hours, at 00:00 and 12:00 UTC.",
    every: 12 * HOUR,
    offset: 0, // 00:00 and 12:00 UTC
    small: true,
    info: "At this time, you're given:",
    list: ["3 more leve allowances, up to 100"]
  },
  {
    kind: "recurring",
    id: "fashion_judging",
    name: "Fashion Report",
    question: "When does FFXIV Fashion Report judging start?",
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
    question: "When is the FFXIV Jumbo Cactpot drawing?",
    every: 7 * DAY,
    small: true,
    list: ["Jumbo Cactpot drawing", "Early bird bonus active for 1 hour"],
    regions: [
      jumboCactpot("eu", "EU", 2 * DAY + 19 * HOUR, "Chaos and Light", ["uk", "ce"]), // Saturday 19:00 UTC
      jumboCactpot("na", "NA", 3 * DAY + 2 * HOUR, "Aether, Primal, Crystal, and Dynamis", ["pt", "et"]), // Sunday 02:00 UTC
      jumboCactpot("jp", "JP", 2 * DAY + 12 * HOUR, "Elemental, Gaia, Mana, and Meteor", ["jp"]), // Saturday 12:00 UTC
      jumboCactpot("oce", "OCE", 2 * DAY + 9 * HOUR, "Materia", ["au"]) // Saturday 09:00 UTC
    ]
  }
]

/**
 * @param {string} id
 * @param {string} name
 * @param {number} offset
 * @param {string} dcs The data centers drawing at this time
 * @param {string[]} zones ZONES keys, the region's own time zones
 */
function jumboCactpot(id, name, offset, dcs, zones) {
  return { id, name, offset, zones, info: `The weekly lottery numbers are drawn for ${dcs}:` }
}

// Where people search from, with how they write the time. names are July's then January's, written out as browsers
// don't agree on them (Chrome has GMT+0 for GMT)
const ZONES = {
  pt: { timeZone: "America/Los_Angeles", names: ["PDT", "PST"], hour12: true },
  et: { timeZone: "America/New_York", names: ["EDT", "EST"], hour12: true },
  uk: { timeZone: "Europe/London", names: ["BST", "GMT"], hour12: false },
  ce: { timeZone: "Europe/Berlin", names: ["CEST", "CET"], hour12: false },
  jp: { timeZone: "Asia/Tokyo", names: ["JST", "JST"], hour12: false },
  au: { timeZone: "Australia/Sydney", names: ["AEST", "AEDT"], hour12: true }
}

/**
 * @param {number} time
 * @param {{ timeZone: string, hour12?: boolean }} zone
 * @returns {{ weekday: string, time: string }} "Tuesday", "8:00 AM"
 */
function partsAt(time, { timeZone, hour12 = false }) {
  const date = new Date(time)
  const clock = hour12 ? { hour: "numeric", hour12: true } : { hour: "2-digit", hour12: false }
  return {
    weekday: date.toLocaleString("en-US", { timeZone, weekday: "long" }),
    time: formatEnGB(date, { timeZone, ...clock, minute: "2-digit" })
  }
}

/**
 * When a daily or weekly timer fires, in UTC and local times, northern summer and winter both as daylight saving
 * moves them an hour. For search engines to quote: "Every day at 15:00 UTC, which is 8:00 AM PDT / 7:00 AM PST, ..."
 * @param {number} every DAY or 7 * DAY
 * @param {number} offset
 * @param {string[]} zones ZONES keys
 * @returns {string}
 */
function schedule(every, offset, zones) {
  const firstAfter = (time) => Math.ceil((time - offset) / every) * every + offset
  const summer = firstAfter(Date.UTC(2026, 6, 1))
  const winter = firstAfter(Date.UTC(2026, 0, 1))
  const utc = partsAt(summer, { timeZone: "UTC" })

  const local = zones.map((key) => {
    const variants = [summer, winter].map((time, i) => {
      const parts = partsAt(time, ZONES[key])
      // Named only when it's another day there, like Sunday 02:00 UTC being Saturday evening in America
      const weekday = parts.weekday === partsAt(time, { timeZone: "UTC" }).weekday ? "" : `${parts.weekday} `
      return `${weekday}${parts.time} ${ZONES[key].names[i]}`
    })
    return [...new Set(variants)].join(" / ")
  })
  const list = local.length > 1 ? `${local.slice(0, -1).join(", ")} and ${local.at(-1)}` : local[0]
  return `Every ${every === DAY ? "day" : utc.weekday} at ${utc.time} UTC, which is ${list}.`
}

// The zones' names on a reset's own page, which lists them all
const ZONE_NAMES = { pt: "US Pacific", et: "US Eastern", uk: "UK", ce: "Central Europe", jp: "Japan", au: "Australia (Sydney)" }

/**
 * When a daily or weekly timer fires in each of ZONES, summer and winter both.
 * @param {RecurringTimer} timer
 * @returns {{ zone: string, time: string }[]} "US Pacific", "Tuesday 1:00 AM PDT / 12:00 AM PST"
 */
export function zoneTimes(timer) {
  const firstAfter = (time) => Math.ceil((time - timer.offset) / timer.every) * timer.every + timer.offset
  const times = [firstAfter(Date.UTC(2026, 6, 1)), firstAfter(Date.UTC(2026, 0, 1))]
  return Object.entries(ZONES).map(([key, zone]) => {
    const parts = times.map((time) => partsAt(time, zone))
    const clocks = [...new Set(parts.map((p, i) => `${p.time} ${zone.names[i]}`))].join(" / ")
    // A weekly one's day, once when summer and winter share it
    const days = [...new Set(parts.map((p) => p.weekday))]
    const time = timer.every === DAY ? clocks
      : days.length === 1 ? `${days[0]} ${clocks}` : parts.map((p, i) => `${p.weekday} ${p.time} ${zone.names[i]}`).join(" / ")
    return { zone: ZONE_NAMES[key], time }
  })
}

for (const timer of TIMERS) {
  if (timer.kind !== "recurring" || timer.every < DAY) continue
  for (const region of timer.regions ?? []) region.when = schedule(timer.every, region.offset, region.zones)
  if (!timer.regions) timer.when ??= schedule(timer.every, timer.offset, ["pt", "et", "uk", "ce"])
}

/**
 * @typedef {object} TimerState What a card shows at a moment
 * @property {string} id
 * @property {string} title
 * @property {number} target What the countdown counts to
 * @property {string} targetLabel "Next at", "Closes at", "Ends at"
 * @property {boolean} open In its window (Ocean Fishing boarding)
 * @property {boolean} small
 * @property {string} [when] When it fires, in words
 * @property {string} info
 * @property {string[]} list
 * @property {{ url: string, text: string }} [link]
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
      when: region ? region.when : timer.when,
      info: region ? region.info : timer.info,
      list: upcoming?.list ?? timer.list ?? [],
      link: timer.link,
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
    when: timer.when,
    info: current.info,
    list: [],
    regions: [],
    note: `Next: ${next.name}`
  }
}

/**
 * When a phased timer's phases next begin, for its page to list.
 * @param {PhasedTimer} timer
 * @param {number} from
 * @param {number} count
 * @returns {{ name: string, start: number }[]} The phases beginning after `from`, in order
 */
export function phaseChanges(timer, from, count) {
  const total = timer.phases.reduce((sum, p) => sum + p.duration, 0)
  let start = timer.startTime + Math.floor((from - timer.startTime) / total) * total
  const changes = []
  for (let i = 0; changes.length < count; i = (i + 1) % timer.phases.length) {
    if (start > from) changes.push({ name: timer.phases[i].name, start })
    start += timer.phases[i].duration
  }
  return changes
}

/**
 * @param {number} now
 * @param {Record<string, string>} [regions] Timer id -> picked region id
 * @returns {TimerState[]}
 */
export const getAllTimerStates = (now, regions = {}) => TIMERS.map((timer) => getTimerState(timer, now, regions[timer.id]))
