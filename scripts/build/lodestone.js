import fs from "fs"
import path from "path"
import sharp from "sharp"
import { fileURLToPath } from "url"
import { writeData } from "../common.js"
import {
  currentPatch, entriesOf, eventName, get, idOf, LODESTONE, leadOf, NEWS, patchNumber, patchOf, periodOf, resolve, textOf, TOPICS,
  windowOf
} from "../sources/lodestone.js"

/**
 * src/js/data/lodestone.json, which this rewrites each run and lodestone.yml commits:
 * - `fixes`, by hand and kept as they are: posts the script can't read or reads wrong, by the ID at the end of their
 *   URL. Each is `{ "skip": true }` to leave it out, or `{ "start": "2026-07-14T08:00Z", "end": "2026-08-03T14:59Z" }`
 *   in UTC, optionally with a `name`, a `lead`, a `url` or `"end": null, "until": "7.5"` for one that runs until a patch
 * - `maintenance` and `events`, what the site shows
 * - `topics`, what each topic in the feed was found to be, so only new and updated ones are opened
 */
const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/js/data/lodestone.json")
// The topics' banners, the site's CSP only lets its own images load
const BANNERS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/images/events")

/**
 * A warning that GitHub Actions also shows on the workflow run, the deploy still goes through.
 * @param {string} message
 */
const warn = (message) => console.warn(process.env.GITHUB_ACTIONS ? `::warning::${message}` : message)

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
