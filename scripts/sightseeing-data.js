import { byId, mapPosition, minutes, nearestAetheryte, saveMaps, sheets, writeData, writeExpansions } from "./datamining.js"

const ET_DAY = 24 * 60

/**
 * Both ends are included: 1800 to 459 is 18:00 up to and with 04:59.
 * @param {Record<string, string>} adventure Adventure sheet row
 * @returns {[number, number][] | null} [start, duration] in ET minutes, null when any time works
 */
function timeWindow(adventure) {
  if (adventure.MinTime === "0" && adventure.MaxTime === "0") return null
  const start = minutes(adventure.MinTime)
  const end = minutes(adventure.MaxTime) + 1
  return [[start, (end - start + ET_DAY) % ET_DAY || ET_DAY]]
}

async function main() {
  const [adventures, phases, levels, emotes, weathers, quests, maps, territories, places, exVersions, aetherytes, markers] = await sheets([
    "Adventure", "AdventureExPhase", "Level", "Emote", "Weather", "Quest", "Map", "TerritoryType", "PlaceName", "ExVersion",
    "Aetheryte", "MapMarker"
  ])

  const level = byId(levels)
  const emote = byId(emotes)
  const weather = byId(weathers)
  const quest = byId(quests)
  const map = byId(maps)
  const territory = byId(territories)
  const place = byId(places)
  const exVersion = byId(exVersions)
  const aetheryteNear = nearestAetheryte({ aetherytes, markers, map, place })

  const SIGHT_TO_BEHOLD = quests.find((q) => q.Name === "A Sight to Behold")
  /**
   * @param {Record<string, string>} q Quest row
   * @returns {{ quest: string, after: string[] }} The quest and the ones it needs first
   */
  const unlockBy = (q) => ({
    quest: q.Name,
    after: [0, 1, 2].map((i) => quest[q[`PreviousQuest[${i}]`]]?.Name).filter(Boolean)
  })

  // "A Sight to Behold" also needs those first vistas logged, which the Quest sheet doesn't say
  const initialVistas = adventures.filter((a) => a.IsInitial === "True").length

  /**
   * A Realm Reborn's first 20 are there from the start, the rest need "A Sight to Behold". Heavensward's only need
   * the level. From Stormblood on, each range of Adventure ids has its own quest.
   * @param {Record<string, string>} adventure
   * @param {string} expansion
   * @returns {{ quest: string, after: string[], vistas?: number } | null}
   */
  function unlockOf(adventure, expansion) {
    const id = +adventure["#"]
    const phase = phases.find((p) => id >= +p.AdventureBegin && id <= +p.AdventureEnd)
    if (phase) return unlockBy(quest[phase.Quest])
    if (expansion === exVersions[0].Name && adventure.IsInitial !== "True") return { ...unlockBy(SIGHT_TO_BEHOLD), vistas: initialVistas }
    return null
  }

  const vistas = []
  const text = {}
  const numbers = {}
  for (const adventure of adventures) {
    const l = level[adventure.Level]
    const t = territory[l?.Territory]
    const zone = place[t?.PlaceName]?.Name
    if (!adventure.Name || !zone) continue

    const expansion = exVersion[t.ExVersion].Name
    // The log numbers each expansion's vistas from 1, in id order
    numbers[expansion] = (numbers[expansion] ?? 0) + 1

    const m = map[l.Map]
    const spot = place[adventure.PlaceName]?.Name
    const times = timeWindow(adventure)
    const unlock = unlockOf(adventure, expansion)

    // Only the listed weather. Rain, Thunderstorms and Blizzards have their own categories, which may also allow
    // Showers, Thunder and Snow, but the data doesn't say
    const needsWeather = adventure.WeatherCategory !== "0" && weather[adventure.Weather]?.Name
    const position = m ? mapPosition(m, l.X, l.Z, l.Radius) : null
    const aetheryte = position && aetheryteNear(l.Map, position.x, position.y)
    text[adventure.Name] = { impression: adventure.Impression, description: adventure.Description }

    vistas.push({
      expansion,
      mapId: m ? m.Id : null,
      entry: {
        number: numbers[expansion],
        name: adventure.Name,
        zone,
        ...(spot && spot !== zone ? { spot } : {}),
        emote: emote[adventure.Emote]?.Name,
        ...(+adventure.MinLevel ? { level: +adventure.MinLevel } : {}),
        ...(times ? { times } : {}),
        ...(needsWeather ? { weather: [needsWeather] } : {}),
        ...(unlock ? { unlock } : {}),
        ...(position ? { map: position } : {}),
        ...(aetheryte ? { aetheryte } : {})
      }
    })
  }

  await saveMaps(vistas.map((v) => v.mapId).filter(Boolean))
  const missing = vistas.filter((v) => !v.entry.map)
  if (missing.length) console.log(`No map position for ${missing.map((v) => v.entry.name).join(", ")}`)

  writeExpansions("sightseeing", exVersions, vistas)
  // The vista pages' text, kept out of the chunks the list page loads
  writeData("sightseeing-text", text)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
