import { byId, mapPosition, saveMaps, sheets, writeExpansions } from "./datamining.js"

// GatheringPoint.Type. Regular and Diadem nodes are always up, the rest only at their times.
// Type 8 (the Diadem's umbral nodes) only shows up in umbral weather, which the data doesn't say when
const NODE_TYPES = { 1: "Regular", 2: "Unspoiled", 4: "Ephemeral", 5: "Legendary", 7: "Diadem" }
const ALWAYS_UP = ["Regular", "Diadem"]
const JOBS = { 0: "Miner", 1: "Miner", 2: "Botanist", 3: "Botanist" }
const NONE = "65535"
const ET_DAY = 24 * 60

/**
 * Times are stored as HHMM ET. Durations too, but with minutes past 59: 160 is 1h60m, so 2 hours.
 * @param {string} hhmm
 * @returns {number} ET minutes
 */
const minutes = (hhmm) => Math.floor(+hhmm / 100) * 60 + (+hhmm % 100)

/**
 * @param {Record<string, string>} transient GatheringPointTransient row
 * @param {Record<string, Record<string, string>>} popTimes GatheringRarePopTimeTable by id
 * @returns {[number, number][] | null} [start, duration] in ET minutes, null for a node that's always up
 */
function spawnTimes(transient, popTimes) {
  if (transient.GatheringRarePopTimeTable !== "0") {
    const table = popTimes[transient.GatheringRarePopTimeTable]
    const times = []
    for (let i = 0; table[`StartTime[${i}]`] !== undefined; i++) {
      if (table[`StartTime[${i}]`] !== NONE) times.push([minutes(table[`StartTime[${i}]`]), minutes(table[`Duration[${i}]`])])
    }
    return times.length ? times : null
  }

  // Ephemeral: a start and end, which can wrap past midnight (20:00 to 00:00)
  if (transient.EphemeralStartTime !== NONE) {
    const start = minutes(transient.EphemeralStartTime)
    const end = minutes(transient.EphemeralEndTime)
    return [[start, (end - start + ET_DAY) % ET_DAY || ET_DAY]]
  }

  return null
}

async function main() {
  const [
    points, bases, transients, popTimes, gatheringItems, items, levels,
    subCategories, quests, exportedPoints, maps, territories, places, exVersions
  ] = await sheets([
    "GatheringPoint", "GatheringPointBase", "GatheringPointTransient", "GatheringRarePopTimeTable", "GatheringItem", "Item",
    "GatheringItemLevelConvertTable", "GatheringSubCategory", "Quest", "ExportedGatheringPoint", "Map",
    "TerritoryType", "PlaceName", "ExVersion"
  ])

  const base = byId(bases)
  const transient = byId(transients)
  const pop = byId(popTimes)
  const gatheringItem = byId(gatheringItems)
  const item = byId(items)
  const level = byId(levels)
  const subCategory = byId(subCategories)
  const quest = byId(quests)
  const exportedPoint = byId(exportedPoints)
  const map = byId(maps)
  const territory = byId(territories)
  const place = byId(places)
  const exVersion = byId(exVersions)

  const nodeItems = (b) => {
    const list = []
    for (let i = 0; b[`Item[${i}]`] !== undefined; i++) {
      const g = gatheringItem[b[`Item[${i}]`]]
      const it = g && item[g.Item]
      if (!it?.Name) continue

      const entry = { id: +g.Item, name: it.Name }
      const stars = +(level[g.GatheringItemLevel]?.Stars ?? 0)
      if (stars) entry.stars = stars
      if (+g.PerceptionReq) entry.perception = +g.PerceptionReq
      if (g.IsHidden === "True") entry.hidden = true
      if (it.IsCollectable === "True" || it.AlwaysCollectable === "True") entry.collectable = true
      list.push(entry)
    }
    return list
  }

  // A node can have several gathering points (spots it can appear at) with the same items and times, keep one
  // An always up node has many spawn points, which can be in different spots: it gets the one most of them are in
  const spotCounts = new Map()
  for (const point of points) {
    const counts = spotCounts.get(point.GatheringPointBase) ?? new Map()
    counts.set(point.PlaceName, (counts.get(point.PlaceName) ?? 0) + 1)
    spotCounts.set(point.GatheringPointBase, counts)
  }
  const mainSpot = (baseId) => [...spotCounts.get(baseId)].sort((a, b) => b[1] - a[1])[0][0]

  const nodes = new Map()
  for (const point of points) {
    const type = NODE_TYPES[point.Type]
    const t = territory[point.TerritoryType]
    const zone = place[t?.PlaceName]?.Name
    if (!type || !zone) continue

    const alwaysUp = ALWAYS_UP.includes(type)
    const times = transient[point["#"]] ? spawnTimes(transient[point["#"]], pop) : null
    const b = base[point.GatheringPointBase]
    const nodeItemList = b && nodeItems(b)
    if (alwaysUp === !!times || !nodeItemList?.length) continue

    const spotId = alwaysUp ? mainSpot(point.GatheringPointBase) : point.PlaceName
    const key = alwaysUp
      ? `base|${point.GatheringPointBase}`
      : [point.TerritoryType, point.PlaceName, JSON.stringify(times), nodeItemList.map((i) => i.id).join()].join("|")
    if (nodes.has(key)) continue

    // Locked behind a folklore book (Item) or a quest. With both, the quest only unlocks buying the book,
    // and the quest-only ones have "Lv. 51" and such as their FolkloreBook text
    const sub = subCategory[point.GatheringSubCategory]
    const folklore = sub && sub.Item !== "0" ? sub.FolkloreBook : null
    const unlock = sub && sub.Item === "0" && sub.Quest !== "0" ? quest[sub.Quest]?.Name : null
    // Exported per GatheringPointBase: the middle of the area the node can show up in
    const m = map[t.Map]
    const exported = exportedPoint[point.GatheringPointBase]
    const position = m && exported && +exported.X !== 0 ? mapPosition(m, exported.X, exported.Y, exported.Radius) : null

    // Only `node` gets written, the rest is for sorting, grouping and saving maps
    nodes.set(key, {
      territory: +point.TerritoryType,
      expansion: exVersion[t.ExVersion].Name,
      mapId: position ? m.Id : null,
      node: {
        id: +point.GatheringPointBase,
        type,
        job: JOBS[b.GatheringType],
        level: +b.GatheringLevel,
        zone,
        ...(place[spotId]?.Name ? { spot: place[spotId].Name } : {}),
        ...(folklore ? { folklore } : {}),
        ...(unlock ? { quest: unlock } : {}),
        ...(position ? { map: position } : {}),
        ...(times ? { times } : {}),
        items: nodeItemList
      }
    })
  }

  await saveMaps([...nodes.values()].map((n) => n.mapId).filter(Boolean))
  const missing = [...nodes.values()].filter((n) => !n.node.map)
  if (missing.length) console.log(`No map position for ${missing.map((n) => n.node.id).join(", ")}`)

  const sorted = [...nodes.values()].sort((a, b) => a.territory - b.territory || a.node.level - b.node.level || a.node.id - b.node.id)
  writeExpansions("gathering", exVersions, sorted.map((n) => ({ expansion: n.expansion, entry: n.node })))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
