import fs from "fs"
import path from "path"
import sharp from "sharp"
import { fileURLToPath } from "url"
import { writeData } from "./datamining.js"

// The EU Lodestone, its posts give times in GMT first
const LODESTONE = "https://eu.finalfantasyxiv.com/lodestone"
const NEWS = `${LODESTONE}/news/news.xml`
const TOPICS = `${LODESTONE}/news/topics.xml`
const VERSIONS = "https://v2.xivapi.com/api/version"
/**
 * src/js/data/lodestone.json, which this rewrites each run and lodestone.yml commits:
 * - `fixes`, by hand and kept as they are: posts the script can't read or reads wrong, by the ID at the end of their
 *   URL. Each is `{ "skip": true }` to leave it out, or `{ "start": "2026-07-14T08:00Z", "end": "2026-08-03T14:59Z" }`
 *   in UTC, optionally with a `name`, a `lead`, a `url` or `"end": null, "until": "7.5"` for one that runs until a patch
 * - `maintenance` and `events`, what the site shows
 * - `topics`, what each topic in the feed was found to be, so only new and updated ones are opened
 */
const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/js/data/lodestone.json")
// The topics' banners, the site's CSP only lets its own images load
const BANNERS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/images/events")
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", "#39": "'" }

// "Oct. 9, 2026 10:35 to 11:55 (GMT)", also with a second date, a "from" or no space after "Oct."
const DATE = String.raw`([A-Z][a-z]{2})[a-z]*\.?\s*(\d{1,2}),\s*(\d{4})`
const WINDOW = new RegExp(String.raw`${DATE}\s+(?:from\s+)?(\d{1,2}):(\d{2})\s+to\s+(?:${DATE}\s+)?(\d{1,2}):(\d{2})\s*\(GMT\)`)

// "7 October 2026 at 8:00 (GMT) / 9:00 (BST) until Tuesday, 27 October 2026 at 14:59 (GMT)", special pages drop the brackets
const DAY_AT = String.raw`(\d{1,2})\s+([A-Z][a-z]+)\.?\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*\(?GMT\b`
const PERIOD = new RegExp(String.raw`${DAY_AT}[\s\S]{0,120}?\b(?:to|until)\s+(?:[A-Z][a-z]+day,\s+)?${DAY_AT}`)
// "31 March 2026 at 8:00 GMT (19:00 AEDT)\nto the release of Patch 7.5"
const UNTIL_PATCH = new RegExp(String.raw`${DAY_AT}[\s\S]{0,120}?\b(?:to|until)\s+the\s+release\s+of\s+Patch\s+(\d+\.\d+)`)

/**
 * @param {string} text
 * @returns {string} With HTML entities undone
 */
const unescape = (text) => text.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, name) => ENTITIES[name])

/**
 * @param {string} html
 * @returns {string} Its text, a line per <br> or block
 */
const textOf = (html) => unescape(html
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
  .replace(/<br\s*\/?>|<\/(?:p|div|h\d|li|dt|dd)>/gi, "\n")
  .replace(/<[^>]+>/g, ""))

/**
 * @param {string} url A Lodestone post
 * @returns {string} Its ID, what lodestone.json's fixes are keyed by
 */
const idOf = (url) => url.match(/detail\/([0-9a-f]+)/)?.[1] ?? url

/**
 * A warning that GitHub Actions also shows on the workflow run, the deploy still goes through.
 * @param {string} message
 */
const warn = (message) => console.warn(process.env.GITHUB_ACTIONS ? `::warning::${message}` : message)

/**
 * @param {string} month "Oct", "Sept." or "October"
 * @param {string} day
 * @param {string} year
 * @param {string} hour
 * @param {string} minute
 * @returns {number} Unix ms, NaN for a month it doesn't know
 */
function utc(month, day, year, hour, minute) {
  const index = MONTHS.indexOf(month.slice(0, 3))
  return index < 0 ? NaN : Date.UTC(+year, index, +day, +hour, +minute)
}

/**
 * @param {string} url
 * @returns {Promise<Response>}
 */
async function get(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res
}

/**
 * @param {string} url A link from a topic
 * @returns {Promise<string>} Where it ends up, following sqex.to shortlinks without loading their destination
 */
async function resolve(url) {
  for (let hops = 0; hops < 5 && url.startsWith("https://sqex.to/"); hops++) {
    const res = await fetch(url, { redirect: "manual" })
    const next = res.headers.get("location")
    if (!next) throw new Error(`${url}: HTTP ${res.status}, no redirect`)
    url = new URL(next, url).href
  }
  return url
}

/**
 * @param {string} xml An Atom feed
 * @returns {{ title: string, url: string, category: string, html: string, image: string, updated: string }[]} Its
 * entries, `image` the banner's URL or ""
 */
export function entriesOf(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, block]) => ({
    title: unescape(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").trim(),
    url: block.match(/<link rel="alternate"[^>]*href="([^"]+)"/)?.[1] ?? "",
    category: block.match(/<category term="([^"]+)"/)?.[1] ?? "",
    html: unescape(block.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ?? ""),
    image: block.match(/<link rel="enclosure" href="([^"]+)"/)?.[1] ?? "",
    updated: block.match(/<updated>([^<]+)<\/updated>/)?.[1] ?? ""
  }))
}

/**
 * @param {string} html A topic's content
 * @returns {string} Its first paragraph, the post's lead
 */
export const leadOf = (html) => textOf(html.replace(/<img[^>]*>/g, "")).trim().split("\n")[0].replace(/\s+/g, " ").trim()

/**
 * @param {string} text A maintenance post's text
 * @returns {{ start: number, end: number } | null} The first GMT window under its [Date & Time], in Unix ms
 */
export function windowOf(text) {
  const m = text.split("[Date & Time]")[1]?.match(WINDOW)
  if (!m) return null
  const [, mon, day, year, startH, startM, endMon = mon, endDay = day, endYear = year, endH, endM] = m
  const start = utc(mon, day, year, startH, startM)
  let end = utc(endMon, endDay, endYear, endH, endM)
  // "23:00 to 2:00" with no second date runs past midnight
  if (end <= start && !m[6]) end += 24 * 60 * 60 * 1000
  return Number.isNaN(start) || Number.isNaN(end) ? null : { start, end }
}

/**
 * @param {string} text An event post's or special page's text
 * @returns {{ start: number, end: number | null, until?: string } | null} Its first GMT period, in Unix ms. One that
 * runs until a patch has a null end and that patch as `until`
 */
export function periodOf(text) {
  const m = text.match(PERIOD)
  if (m) {
    const start = utc(m[2], m[1], m[3], m[4], m[5])
    const end = utc(m[7], m[6], m[8], m[9], m[10])
    return Number.isNaN(start) || Number.isNaN(end) || end <= start ? null : { start, end }
  }
  const open = text.match(UNTIL_PATCH)
  if (!open) return null
  const start = utc(open[2], open[1], open[3], open[4], open[5])
  return Number.isNaN(start) ? null : { start, end: null, until: open[6] }
}

/**
 * @param {string} text A maintenance post's text
 * @returns {string | null} "7.5" for "In order to implement Patch 7.5, maintenance will take place…"
 */
export const patchOf = (text) => text.match(/implement Patch (\d+\.\d+)/i)?.[1] ?? null

/**
 * @param {string} title "All Saints' Wake Begins 15 October", "Valentione's Day Comes to Eorzea on 2 February"
 * @returns {string} "All Saints' Wake", "Valentione's Day"
 */
export const eventName = (title) => title.replace(/\s+(?:Begins|Returns|Is Back|Starts|Comes|Commences)\b.*$/i, "").replace(/!+$/, "")

/**
 * @param {string} version "7.56x1"
 * @returns {number} 7.56, so "Patch 7.5" compares as 7.5 and "7.1" comes after "7.05"
 */
export const patchNumber = (version) => parseFloat(version)

/** @returns {Promise<number>} The game's version from XIVAPI, like 7.56 */
async function currentPatch() {
  const { versions } = await (await get(VERSIONS)).json()
  const latest = versions.find((v) => v.names.includes("latest"))
  const version = patchNumber(latest?.names.find((name) => name !== "latest") ?? "")
  if (Number.isNaN(version)) throw new Error(`${VERSIONS}: no latest version, has it changed?`)
  return version
}

/**
 * @param {object} fix One of lodestone.json's fixes
 * @returns {{ start: number, end: number | null, until?: string }}
 */
const fixedPeriod = (fix) => ({ start: Date.parse(fix.start), end: fix.end ? Date.parse(fix.end) : null, ...fix.until && { until: fix.until } })

/**
 * @param {Record<string, object>} fixes
 * @returns {Promise<{ list: object[], patches: Record<string, number> }>} All Worlds maintenance that hasn't ended,
 * and when each patch the posts name goes live
 */
async function maintenance(fixes) {
  const entries = entriesOf(await (await get(NEWS)).text())
  if (!entries.length) throw new Error(`${NEWS}: no entries, has the feed changed?`)

  const list = []
  const patches = {}
  for (const entry of entries) {
    if (entry.category !== "Maintenance" || !/^All Worlds (?:Emergency )?Maintenance/i.test(entry.title)) continue
    const fix = fixes[idOf(entry.url)]
    if (fix?.skip) continue
    const text = textOf(entry.html)
    const window = fix ? fixedPeriod(fix) : windowOf(text)
    // Better a failed deploy that keeps the last good file than a site that quietly shows no maintenance
    if (!window) throw new Error(`Couldn't read the times of "${entry.title}" ${entry.url}, add it to the fixes in src/js/data/lodestone.json as ${idOf(entry.url)}`)
    const patch = patchOf(text)
    if (patch) patches[patch] = window.start
    if (window.end > Date.now()) list.push({ name: fix?.name ?? entry.title, url: entry.url, ...window, ...patch && { patch } })
  }
  return { list, patches }
}

/**
 * Collab events give their dates under "Event Period" in the post, seasonal ones on a special page it links to.
 * Sales and campaigns have neither, so they're left out.
 * @param {{ title: string, url: string }} entry A topic
 * @returns {Promise<{ url: string, start: number, end: number | null, until?: string } | null | undefined>} Where its
 * details are and when it runs, null when it isn't an event, undefined when it is but its dates can't be read
 */
async function readTopic(entry) {
  const html = await (await get(entry.url)).text()
  const body = html.match(/news__detail__wrapper[\s\S]*?<\/article>/)?.[0] ?? ""
  const text = textOf(body)
  const fixNote = `add it to the fixes in src/js/data/lodestone.json as ${idOf(entry.url)}`

  if (/^\s*Event Period\s*$/m.test(text)) {
    const period = periodOf(text.slice(text.search(/^\s*Event Period\s*$/m)))
    if (period) return { url: entry.url, ...period }
    warn(`Couldn't read the event period of "${entry.title}" ${entry.url}, ${fixNote}`)
    return undefined
  }

  let unread = false
  for (const [, link] of body.matchAll(/href="(https:\/\/sqex\.to\/[^"]+|https:\/\/eu\.finalfantasyxiv\.com\/lodestone\/special\/[^"]+)"/g)) {
    let res
    try {
      const target = await resolve(link)
      if (!target.startsWith(`${LODESTONE}/special/`)) continue
      res = await get(target)
    } catch (err) {
      // Read again next run rather than cached as "not an event"
      warn(`Couldn't open ${link} in "${entry.title}" ${entry.url}: ${err.message}`)
      unread = true
      continue
    }
    const period = periodOf(textOf(await res.text()))
    if (period) return { url: res.url, ...period }
    // Story pages have no dates, and some events, like Yo-kai Watch's, only give them in pictures
    if (eventName(entry.title) !== entry.title.replace(/!+$/, "")) {
      warn(`No dates on the special page of "${entry.title}" ${res.url}, ${fixNote}`)
      unread = true
    }
  }
  return unread ? undefined : null
}

/**
 * @param {Record<string, object>} fixes
 * @param {Record<string, { updated: string, found: object | null }>} seen What each topic was found to be, by ID. Only
 * new and updated topics are opened, the rest come from here, and it's left with just the topics in the feed
 * @returns {Promise<object[]>} Every event the topics name, `end` null for one that runs until a patch
 */
async function events(fixes, seen) {
  const entries = entriesOf(await (await get(TOPICS)).text())
  if (!entries.length) throw new Error(`${TOPICS}: no entries, has the feed changed?`)

  const list = []
  const ids = new Set()
  for (const entry of entries) {
    const id = idOf(entry.url)
    ids.add(id)
    const fix = fixes[id]
    if (fix?.skip) continue
    const about = { id, name: fix?.name ?? eventName(entry.title), lead: fix?.lead ?? leadOf(entry.html), banner: entry.image }
    if (fix?.start) {
      list.push({ ...about, url: fix.url ?? entry.url, ...fixedPeriod(fix) })
      continue
    }

    const found = seen[id]?.updated === entry.updated ? seen[id].found : await readTopic(entry)
    // Left out so it's read and warned about again next run, until it gets a fix
    if (found === undefined) delete seen[id]
    else seen[id] = { updated: entry.updated, found }
    if (found) list.push({ ...about, ...found })
  }
  for (const id of Object.keys(seen)) if (!ids.has(id)) delete seen[id]
  return list
}

/**
 * Saves the events' banners to src/images/events/<id>.webp, and removes the ones of events that are gone.
 * @param {object[]} list The events, each with its banner's URL
 * @returns {Promise<object[]>} Them with `image`, the banner's path on the site, in place of that URL
 */
async function saveBanners(list) {
  fs.mkdirSync(BANNERS, { recursive: true })
  const keep = new Set()
  const saved = await Promise.all(list.map(async ({ banner, ...event }) => {
    if (!banner) return event
    const file = `${event.id}.webp`
    if (!fs.existsSync(path.join(BANNERS, file))) {
      const res = await get(banner)
      await sharp(Buffer.from(await res.arrayBuffer())).webp({ quality: 70, effort: 6 }).toFile(path.join(BANNERS, file))
    }
    keep.add(file)
    return { ...event, image: `/images/events/${file}` }
  }))
  for (const file of fs.readdirSync(BANNERS)) if (!keep.has(file)) fs.rmSync(path.join(BANNERS, file))
  return saved
}

async function main() {
  const last = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, "utf8")) : {}
  const fixes = last.fixes ?? {}
  const seen = last.topics ?? {}
  const [{ list: maint, patches }, evts] = await Promise.all([maintenance(fixes), events(fixes, seen)])

  const now = Date.now()
  // Ends once the patch's maintenance starts, while that post is up
  const dated = evts.map((event) => event.end === null && patches[event.until] ? { ...event, end: patches[event.until] } : event)
  const patch = dated.some((event) => event.end === null) ? await currentPatch() : 0
  const live = dated.filter((event) => event.end === null ? patchNumber(event.until) > patch : event.end > now)

  const byStart = (a, b) => a.start - b.start
  writeData("lodestone", {
    fixes,
    maintenance: maint.sort(byStart),
    events: (await saveBanners(live)).sort(byStart),
    topics: seen
  })
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
