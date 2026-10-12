import { byId, plainNames, saveIcons, sheets, writeData } from "./datamining.js"

// IKDRoute's Time values. The sheet doesn't name them, these match the blue fish each voyage can catch
const TIMES = { 1: "Sunset", 2: "Night", 3: "Day" }
// The bait, hookset and tug of each fish at each stop, from Teamcraft (MIT) like the fish that bite any time (see
// fishing-data.js)
const TEAMCRAFT = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/fishing-sources.json"
const HOOKSETS = { 1: "Powerful", 2: "Precision" }
const TUGS = { 0: "medium", 1: "heavy", 2: "light" }
// Teamcraft's oceanFishingTime, the time of day a fish needs at its stop. 0 is any
const OCEAN_TIMES = { 1: "Sunset", 2: "Day", 3: "Night" }
// Item.Rarity of the blue fish, the rarest a spectral current turns up
const BLUE_FISH = "3"

async function main() {
  const res = await fetch(TEAMCRAFT)
  if (!res.ok) throw new Error(`${TEAMCRAFT}: HTTP ${res.status}`)
  const teamcraft = await res.json()

  const [routes, table, spots, places, fishingSpots, items] = await sheets([
    "IKDRoute", "IKDRouteTable", "IKDSpot", "PlaceName", "FishingSpot", "Item"
  ])
  const spot = byId(spots)
  const place = byId(plainNames(places))
  const fishingSpot = byId(fishingSpots)
  const item = byId(items)

  /**
   * @param {Record<string, string>} route IKDRoute row
   * @returns {{ destination: string, stops: { place: string, time: string }[] }} The stops in order, with the time of day at each
   */
  const routeOf = (route) => {
    const stops = [0, 1, 2].map((i) => ({ place: place[spot[route[`Spot[${i}]`]].PlaceName].Name, time: TIMES[route[`Time[${i}]`]] }))
    return { destination: stops.at(-1).place, stops }
  }

  const schedule = table.map((row) => ({ indigo: +row.IndigoRoute, ruby: +row.RubyRoute }))
  writeData("ocean-fishing", {
    routes: Object.fromEntries(routes.filter((r) => r.Name).map((r) => [r["#"], routeOf(r)])),
    // A voyage every 2 hours, going through these in order, see utils/voyages.js
    schedule
  })

  const named = (id) => ({ id: +id, name: item[id].Name })

  /**
   * @param {string} spotId FishingSpot row
   * @returns {object[]} Its fish, with how to catch each where Teamcraft knows
   */
  const fishAt = (spotId) => {
    const row = fishingSpot[spotId]
    const list = []
    for (let i = 0; row[`Item[${i}]`] !== undefined; i++) {
      const id = row[`Item[${i}]`]
      if (+id <= 0 || !item[id]?.Name) continue

      // A row per bait it's been caught on, the first is the one to use, like fishing-data.js does
      const source = (teamcraft[id] ?? []).find((s) => String(s.spot) === spotId)
      list.push({
        ...named(id),
        ...(item[id].Rarity === BLUE_FISH ? { blue: true } : {}),
        // Which voyages can catch a blue fish, see js/ocean.js
        ...(item[id].Rarity === BLUE_FISH && OCEAN_TIMES[source?.oceanFishingTime] ? { time: OCEAN_TIMES[source.oceanFishingTime] } : {}),
        ...(item[source?.bait]?.Name ? { bait: named(source.bait) } : {}),
        ...(HOOKSETS[source?.hookset] ? { hookset: HOOKSETS[source.hookset] } : {}),
        ...(TUGS[source?.tug] ? { tug: TUGS[source.tug] } : {}),
        ...(source?.predators?.length ? { predators: source.predators.map((p) => ({ ...named(p.id), count: p.amount })) } : {})
      })
    }
    return list
  }

  // Indigo leaves from Limsa Lominsa, Ruby from Kugane, each stop is on one of them
  const routeName = new Map()
  for (const [key, name] of [["indigo", "Indigo"], ["ruby", "Ruby"]]) {
    for (const id of new Set(schedule.map((s) => s[key]))) {
      for (let i = 0; i < 3; i++) routeName.set(routes.find((r) => r["#"] === String(id))[`Spot[${i}]`], name)
    }
  }

  const stops = spots
    .filter((s) => s.SpotMain !== "0" && routeName.has(s["#"]))
    .map((s) => ({ place: place[s.PlaceName].Name, route: routeName.get(s["#"]), fish: fishAt(s.SpotMain), spectral: fishAt(s.SpotSub) }))

  // Only the build reads this, for /ocean-fishing/, the homepage's timer needs no more than the schedule
  const ids = [...new Set(stops.flatMap((s) => [...s.fish, ...s.spectral]).flatMap((f) => [f.id, ...(f.bait ? [f.bait.id] : [])]))]
  writeData("ocean-fish", { stops, icons: Object.fromEntries(ids.map((id) => [id, +item[id].Icon])) })
  await saveIcons(ids.map((id) => +item[id].Icon))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
