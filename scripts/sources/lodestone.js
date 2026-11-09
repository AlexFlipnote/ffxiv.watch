// The Lodestone, the game's official news: its feeds and pages, and reading the dates out of their text

// The EU Lodestone, its posts give times in GMT first
export const LODESTONE = "https://eu.finalfantasyxiv.com/lodestone"
export const NEWS = `${LODESTONE}/news/news.xml`
export const TOPICS = `${LODESTONE}/news/topics.xml`
// Every patch's notes, a link each as it's released
const PATCH_NOTES = `${LODESTONE}/special/patchnote_log/`
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
export const textOf = (html) => unescape(html
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
  .replace(/<br\s*\/?>|<\/(?:p|div|h\d|li|dt|dd)>/gi, "\n")
  .replace(/<[^>]+>/g, ""))

/**
 * @param {string} url A Lodestone post
 * @returns {string} Its ID, what lodestone.json's fixes are keyed by
 */
export const idOf = (url) => url.match(/detail\/([0-9a-f]+)/)?.[1] ?? url

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
export async function get(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res
}

/**
 * @param {string} url A link from a topic
 * @returns {Promise<string>} Where it ends up, following sqex.to shortlinks without loading their destination
 */
export async function resolve(url) {
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

/** @returns {Promise<number>} The newest patch with its notes out, like 7.57 */
export async function currentPatch() {
  const page = await (await get(PATCH_NOTES)).text()
  const patches = [...page.matchAll(/Patch (\d+\.\d+) Notes/g)].map(([, patch]) => patchNumber(patch))
  if (!patches.length) throw new Error(`${PATCH_NOTES}: no patch notes, has the page changed?`)
  return Math.max(...patches)
}
