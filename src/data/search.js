import { asset } from "mothwing"
import { itemUrl } from "../render/gathering.js"
import { readData, readExpansions } from "../render/html.js"

// The other pages, with the words people might look for them by
const PAGES = [
  ["Timers", "/", "eorzea time clock"],
  ["Sightseeing log", "/sightseeing/", "vistas"],
  ["Gathering", "/gathering/", "nodes miner botanist timed legendary"],
  ["Fishing", "/fishing/", "big fish"],
  ["Weather", "/weather/", "forecast"],
  ["Ocean fishing", "/ocean-fishing/", "voyages routes"],
  ["Gold Saucer", "/gold-saucer/", "gate jumbo cactpot fashion report"],
  ["Events", "/events/", "maintenance seasonal lodestone"],
  ["PvP maps", "/pvp/", "crystalline conflict frontline rival wings"],
  ["Daily reset", "/daily-reset/", "roulettes beast tribe"],
  ["Weekly reset", "/weekly-reset/", "tomestones raids"],
  ["Housing lottery", "/housing-lottery/", "plots"],
  ["About", "/about/", "credits"]
]

/**
 * Everything the navbar's search finds. Names only, the script slugs them into URLs.
 * @returns {{ fish: [string, number][], gathering: [string, number][], sightseeing: string[], weather: string[], pages: string[][] }}
 */
function searchIndex() {
  const fishInfo = readData("fishing-items.json")
  const itemInfo = readData("gathering-items.json")

  const items = new Map()
  for (const expansion of readExpansions("gathering")) {
    for (const node of expansion.entries) {
      for (const item of node.items) {
        if (itemUrl(item) && !items.has(item.id)) items.set(item.id, [item.name, itemInfo[item.id].icon])
      }
    }
  }

  return {
    fish: readExpansions("fishing").flatMap((e) => e.entries.map((fish) => [fish.name, fishInfo[fish.id].icon])),
    gathering: [...items.values()],
    sightseeing: readExpansions("sightseeing").flatMap((e) => e.entries.map((vista) => vista.name)),
    weather: readData("weather.json").map((zone) => zone.name),
    pages: PAGES
  }
}

// No `sources`, every page links to it and a data update shouldn't redate them all in the sitemap
export default () => ({ index: asset("search.json", JSON.stringify(searchIndex())) })
