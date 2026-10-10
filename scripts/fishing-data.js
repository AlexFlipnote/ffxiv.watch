import { byId, nearestAetheryte, saveIcons, saveMaps, sheets, writeData, writeExpansions, zoneWeather } from "./datamining.js"

// When each fish bites, what with and after which weather isn't in the game's data. Carbuncle Plushy's fish tracker
// (MIT) keeps it, for the fish with a condition and every big fish: https://github.com/icykoneko/ff14-fish-tracker-app
const TRACKER = "https://raw.githubusercontent.com/icykoneko/ff14-fish-tracker-app/master/js/app/data.js"
// The rest of the fishing log bites any time. Teamcraft (MIT) has their bait, hookset and tug, per spot
const TEAMCRAFT = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/fishing-sources.json"
const HOOKSETS = { 1: "Powerful", 2: "Precision" }
const TUGS = { 0: "medium", 1: "heavy", 2: "light" }

const ET_DAY = 24 * 60
const round = (n) => Math.round(n * 10) / 10

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
 * The tracker's data is a script, `const DATA = { FISH: {...}, ... }`. Only its keys aren't JSON, so it's read as
 * that rather than run.
 * @returns {Promise<{ FISH: object, FOLKLORE: object }>}
 */
async function trackerData() {
  const text = await (await get(TRACKER)).text()
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1).replace(/^(\s*)([A-Z_]+):/gm, "$1\"$2\":"))
}

/**
 * FishingSpot and SpearfishingNotebook place a spot in pixels on the 2048px map texture, its radius in tenths of those.
 * @param {Record<string, string>} map Map sheet row
 * @param {number | string} x
 * @param {number | string} y
 * @param {number | string} radius
 * @returns {{ image: string, scale: number, x: number, y: number, radius: number }} Like mapPosition in datamining.js
 */
function mapPixels(map, x, y, radius) {
  const scale = +map.SizeFactor / 100
  return {
    image: map.Id.replace("/", "-"),
    scale: +map.SizeFactor,
    x: round((41 / scale) * (+x / 2048) + 1),
    y: round((41 / scale) * (+y / 2048) + 1),
    radius: round((41 / scale) * (+radius / 10 / 2048))
  }
}

/**
 * @param {number} start ET hour, can be a half (17.5)
 * @param {number} end ET hour, past midnight when lower than start
 * @returns {[number, number][] | null} [start, duration] in ET minutes, null when it bites any time (0 to 24)
 */
function biteTimes(start, end) {
  const duration = ((end - start) * 60 + ET_DAY) % ET_DAY
  return duration ? [[start * 60, duration]] : null
}

async function main() {
  const [tracker, teamcraft, [
    spots, notebooks, fishParams, spearItems, items, weathers, maps, territories, places, exVersions, aetherytes, markers,
    uiCategories
  ]] = await Promise.all([
    trackerData(),
    get(TEAMCRAFT).then((res) => res.json()),
    sheets([
      "FishingSpot", "SpearfishingNotebook", "FishParameter", "SpearfishingItem", "Item", "Weather", "Map", "TerritoryType",
      "PlaceName", "ExVersion", "Aetheryte", "MapMarker", "ItemUICategory"
    ])
  ])

  const spot = byId(spots)
  const notebook = byId(notebooks)
  // The tracker places spearfishing fish by the notebook entry's GatheringPointBase
  const notebookByBase = Object.fromEntries(notebooks.map((n) => [n.GatheringPointBase, n]))
  const item = byId(items)
  const weather = byId(weathers)
  const map = byId(maps)
  const territory = byId(territories)
  const place = byId(places)
  const exVersion = byId(exVersions)
  const uiCategory = byId(uiCategories)
  const aetheryteNear = nearestAetheryte({ aetherytes, markers, map, place })
  const inLog = (rows) => rows.filter((r) => +r.Item > 0 && r.IsInLog === "True")
  const logSpot = Object.fromEntries(inLog(fishParams).map((p) => [p.Item, p.FishingSpot]))
  // The fishing log's text, by item
  const logText = Object.fromEntries([...fishParams, ...spearItems].map((p) => [p.Item, p.Text ?? p.Description]))

  const named = (id) => ({ id: +id, name: item[id].Name })
  const weatherNames = (ids) => ids.map((id) => weather[id].Name)
  const possibleWeather = zoneWeather()

  /**
   * @param {string} id Item id
   * @param {{ row: Record<string, string>, x: string, y: string, spotId?: string } | null} location The spot's row, with
   * TerritoryType, PlaceName, Radius and GatheringLevel, its position on the map texture, and its id for a FishingSpot
   * @param {object} fish What's known about catching it, past where
   * @returns {object | null} What gets sorted and written, null when it has no spot
   */
  function entry(id, location, fish) {
    const it = item[id]
    const t = location && territory[location.row.TerritoryType]
    const zone = place[t?.PlaceName]?.Name
    if (!it?.Name || !zone) return null

    // The tracker lists some weather the zone never has, like Snow in Gridania
    for (const key of ["weather", "previousWeather"]) {
      const never = fish[key]?.filter((w) => !possibleWeather.get(zone)?.has(w)) ?? []
      if (!never.length || never.length === fish[key].length) continue
      console.log(`${it.Name}: dropped ${key} ${never.join(", ")}, never happens in ${zone}`)
      fish = { ...fish, [key]: fish[key].filter((w) => !never.includes(w)) }
    }

    const m = map[t.Map]
    const position = m ? mapPixels(m, location.x, location.y, location.row.Radius) : null
    const aetheryte = position && aetheryteNear(t.Map, position.x, position.y)
    // Nothing to wait for, the list hides these until asked (see js/fishing.js)
    const anyTime = !fish.big && !fish.times && !fish.weather && !fish.previousWeather && !fish.predators

    return {
      territory: +location.row.TerritoryType,
      expansion: exVersion[t.ExVersion].Name,
      mapId: position ? m.Id : null,
      fish: {
        id: +id,
        name: it.Name,
        method: location.spotId ? "Fishing" : "Spearfishing",
        level: +location.row.GatheringLevel,
        zone,
        ...(place[location.row.PlaceName]?.Name ? { spot: place[location.row.PlaceName].Name } : {}),
        ...(position ? { map: position } : {}),
        ...(aetheryte ? { aetheryte } : {}),
        ...(anyTime ? { anyTime } : {}),
        ...fish
      }
    }
  }

  const fishingSpot = (id) => spot[id] && { row: spot[id], x: spot[id].X, y: spot[id].Z, spotId: id }
  const spearSpot = (row) => row && { row, x: row.X, y: row.Y }

  const fishes = []
  const skipped = []
  const add = (id, made) => made ? fishes.push(made) : skipped.push(item[id]?.Name ?? id)

  for (const fish of Object.values(tracker.FISH)) {
    // A few have no spot in the tracker, the fishing log has one
    const location = fish.gig ? spearSpot(notebookByBase[fish.location]) : fishingSpot(String(fish.location ?? logSpot[fish._id]))
    const times = biteTimes(fish.startHour, fish.endHour)
    // A step of the catch path can be a list, of fish that work as well as each other
    const bait = fish.bestCatchPath.map((step) => (Array.isArray(step) ? step : [step]).map(named))

    add(fish._id, entry(fish._id, location, {
      ...(fish.bigFish ? { big: true } : {}),
      ...(times ? { times } : {}),
      ...(fish.weatherSet.length ? { weather: weatherNames(fish.weatherSet) } : {}),
      ...(fish.previousWeatherSet.length ? { previousWeather: weatherNames(fish.previousWeatherSet) } : {}),
      ...(bait.length ? { bait } : {}),
      ...(fish.predators.length ? { predators: fish.predators.map(([id, count]) => ({ ...named(id), count })) } : {}),
      // Earth seconds
      ...(fish.intuitionLength ? { intuition: fish.intuitionLength } : {}),
      ...(fish.hookset ? { hookset: fish.hookset } : {}),
      ...(fish.tug ? { tug: fish.tug } : {}),
      // The gig size, the tracker has some as "UNKNOWN"
      ...(fish.gig && fish.gig !== "UNKNOWN" ? { gig: fish.gig } : {}),
      ...(fish.lure ? { lure: fish.lure } : {}),
      ...(fish.snagging ? { snagging: true } : {}),
      // Fish Eyes lets it bite outside its times, not its weather
      ...(fish.fishEyes && times ? { fishEyes: true } : {}),
      ...(fish.folklore ? { folklore: tracker.FOLKLORE[fish.folklore].book_en } : {}),
      ...(fish.collectable ? { collectable: true } : {}),
      patch: fish.patch
    }))
  }

  // The rest of the log, which bites any time
  for (const p of inLog(fishParams).filter((p) => !tracker.FISH[p.Item])) {
    const source = teamcraft[p.Item]?.find((s) => String(s.spot) === p.FishingSpot) ?? teamcraft[p.Item]?.[0]
    add(p.Item, entry(p.Item, fishingSpot(p.FishingSpot), {
      ...(source?.bait && item[source.bait]?.Name ? { bait: [[named(source.bait)]] } : {}),
      ...(HOOKSETS[source?.hookset] ? { hookset: HOOKSETS[source.hookset] } : {}),
      ...(TUGS[source?.tug] ? { tug: TUGS[source.tug] } : {}),
      ...(source?.snagging ? { snagging: true } : {})
    }))
  }
  for (const s of inLog(spearItems).filter((s) => !tracker.FISH[s.Item])) {
    add(s.Item, entry(s.Item, spearSpot(notebook[s.SpearfishingNotebook]), {}))
  }
  if (skipped.length) console.log(`No spot for ${skipped.length}: ${skipped.join(", ")}`)

  await saveMaps(fishes.map((f) => f.mapId).filter(Boolean))

  const sorted = fishes.sort((a, b) => a.territory - b.territory || a.fish.level - b.fish.level || a.fish.id - b.fish.id)
  writeExpansions("fishing", exVersions, sorted.map((f) => ({ expansion: f.expansion, entry: f.fish })))

  // The other spots a fish bites at, "The Mirror, Central Shroud", for its page
  const spotName = (s) => [place[s.PlaceName]?.Name, place[territory[s.TerritoryType]?.PlaceName]?.Name].filter(Boolean).join(", ")
  const spotsOf = new Map()
  for (const s of spots) {
    for (let i = 0; s[`Item[${i}]`] !== undefined; i++) {
      if (+s[`Item[${i}]`] > 0) spotsOf.set(s[`Item[${i}]`], [...spotsOf.get(s[`Item[${i}]`]) ?? [], s])
    }
  }
  const alsoAt = (fish) => {
    const others = (spotsOf.get(String(fish.id)) ?? []).filter((s) => place[s.PlaceName]?.Name !== fish.spot).map(spotName)
    return others.length ? { alsoAt: [...new Set(others)] } : {}
  }

  // The fish pages' text and facts, kept out of the chunks the list page loads. Bait gets an icon there too
  const byFish = new Map(sorted.map((f) => [f.fish.id, f.fish]))
  const baitIds = sorted.flatMap((f) => (f.fish.bait ?? []).flat().map((b) => b.id))
  const ids = [...new Set([...byFish.keys(), ...baitIds])].sort((a, b) => a - b)
  writeData("fishing-items", Object.fromEntries(ids.map((id) => {
    const it = item[id]
    const category = uiCategory[it.ItemUICategory]?.Name
    return [id, {
      ...(logText[id] ? { description: logText[id] } : it.Description ? { description: it.Description } : {}),
      icon: +it.Icon,
      ...(category ? { category } : {}),
      level: +it.LevelItem,
      ...(byFish.has(id) && byFish.get(id).method === "Fishing" ? alsoAt(byFish.get(id)) : {})
    }]
  })))
  await saveIcons(ids.map((id) => +item[id].Icon))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
