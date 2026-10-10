import { byId, sheets, writeData } from "./datamining.js"

// IKDRoute's Time values. The sheet doesn't name them, these match the blue fish each voyage can catch
const TIMES = { 1: "Sunset", 2: "Night", 3: "Day" }

async function main() {
  const [routes, table, spots, places] = await sheets(["IKDRoute", "IKDRouteTable", "IKDSpot", "PlaceName"])
  const spot = byId(spots)
  const place = byId(places)

  /**
   * @param {Record<string, string>} route IKDRoute row
   * @returns {{ destination: string, stops: { place: string, time: string }[] }} The stops in order, with the time of day at each
   */
  const routeOf = (route) => {
    const stops = [0, 1, 2].map((i) => ({ place: place[spot[route[`Spot[${i}]`]].PlaceName].Name, time: TIMES[route[`Time[${i}]`]] }))
    return { destination: stops.at(-1).place, stops }
  }

  writeData("ocean-fishing", {
    routes: Object.fromEntries(routes.filter((r) => r.Name).map((r) => [r["#"], routeOf(r)])),
    // A voyage every 2 hours, going through these in order, see utils/ocean-fishing.js
    schedule: table.map((row) => ({ indigo: +row.IndigoRoute, ruby: +row.RubyRoute }))
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
