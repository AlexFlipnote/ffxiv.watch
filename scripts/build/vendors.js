import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { mapPosition, nearestAetheryte, SCRIP_ITEMS, writeData } from "../common.js"
import { byId, layoutNpcs, plainNames, saveIcons, saveMaps, sheets } from "../sources/game.js"
import { SCRIPT_SHOPS } from "../sources/teamcraft.js"

// Runs after crafting.js, for the items its recipes take

// Where an NPC stands is its Level row, or for the many without one, the zone layout placing it
const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/js/data")
// Level.Type of an NPC standing somewhere, its Object is then the ENpcBase row
const NPC_LEVEL = "8"
// The ENpcData columns, what an NPC does when talked to
const NPC_DATA = 32
const TOPIC_SHOPS = 10
// SpecialShop.UseCurrencyType of the shops that number their tomestones and scrips rather than name the Item
const TOMESTONE_SHOP = "2"
const SCRIP_SHOP = "16"
const LAST_CRYSTAL = 19
const GIL = "1"

/**
 * Every shop an NPC opens, straight away or from its menu: a TopicSelect lists shops, a PreHandler (a "you
 * need this quest first" step) leads to one, an InclusionShop (a scrip exchange) has them by tab, and a CustomTalk's
 * script arguments can name them too. A gemstone trader's are in FateShop, by the NPC.
 * @param {Record<string, string>} npc ENpcBase row
 * @param {{ shops: Set<string>, topic: object, pre: object, talk: object, inclusion: Map<string, string[]>, fate: object }} sheets By id
 * @returns {string[]} GilShop and SpecialShop ids
 */
function shopsOf(npc, { shops, topic, pre, talk, inclusion, fate }) {
  const found = new Set()
  const follow = (id, depth = 0) => {
    if (!id || id === "0" || depth > 3) return
    if (shops.has(id)) found.add(id)
    else if (topic[id]) for (let i = 0; i < TOPIC_SHOPS; i++) follow(topic[id][`Shop[${i}]`], depth + 1)
    else if (pre[id]) follow(pre[id].Target, depth + 1)
    else if (inclusion.has(id)) for (const shop of inclusion.get(id)) follow(shop, depth + 1)
    else if (talk[id]) for (const [key, value] of Object.entries(talk[id])) if (key.endsWith("ScriptArg")) follow(value, depth + 1)
  }
  for (let i = 0; i < NPC_DATA; i++) follow(npc[`ENpcData[${i}]`])
  for (const [key, shop] of Object.entries(fate[npc["#"]] ?? {})) if (key.startsWith("SpecialShop[")) follow(shop)
  return [...found]
}

/**
 * @param {Record<string, string>[]} shops InclusionShop rows
 * @param {Record<string, string>[]} categories InclusionShopCategory rows, a tab each
 * @param {Record<string, string>[]} series InclusionShopSeries rows, "<series>.<n>" the special shops of one
 * @returns {Map<string, string[]>} InclusionShop id -> the special shops on its tabs
 */
function inclusionShops(shops, categories, series) {
  const category = byId(categories)
  const shopsOfSeries = new Map()
  for (const row of series) {
    const id = row["#"].split(".")[0]
    shopsOfSeries.set(id, [...shopsOfSeries.get(id) ?? [], row.SpecialShop])
  }
  return new Map(shops.map((shop) => [shop["#"], Object.entries(shop)
    .filter(([key]) => key.startsWith("Category["))
    .flatMap(([, tab]) => shopsOfSeries.get(category[tab]?.InclusionShopSeries) ?? [])]))
}

/**
 * What a special shop asks for, as the Item it is: the sheet names the item itself, a scrip or a tomestone by its
 * own numbering, by the shop's UseCurrencyType.
 * @param {Record<string, string>} shop SpecialShop row
 * @param {string} cost Its ItemCost
 * @param {Record<string, string>} tomestones The tomestone number -> its Item id
 * @returns {string | undefined} The Item id, none for one it can't tell
 */
function currencyOf(shop, cost, tomestones) {
  if (shop.UseCurrencyType === TOMESTONE_SHOP) return tomestones[cost]
  if (shop.UseCurrencyType === SCRIP_SHOP) return SCRIP_ITEMS[cost] && String(SCRIP_ITEMS[cost])
  // The low ids are the crystals, a scrip shop's numbers when it doesn't say so
  return +cost > LAST_CRYSTAL ? cost : undefined
}

async function main() {
  const [
    shopItems, gilShops, specialShops, items, tomestoneItems, quests, npcBases, npcNames, levels, topics, preHandlers, talks,
    inclusions, inclusionCategories, inclusionSeries, fateShops, maps, territories, places, aetherytes, markers
  ] = await sheets([
    "GilShopItem", "GilShop", "SpecialShop", "Item", "TomestonesItem", "Quest", "ENpcBase", "ENpcResident", "Level",
    "TopicSelect", "PreHandler", "CustomTalk", "InclusionShop", "InclusionShopCategory", "InclusionShopSeries", "FateShop",
    "Map", "TerritoryType", "PlaceName", "Aetheryte", "MapMarker"
  ])
  const item = byId(items)
  const quest = byId(quests)
  const npcName = byId(npcNames)
  const map = byId(maps)
  const territory = byId(territories)
  const place = byId(plainNames(places))
  const aetheryteNear = nearestAetheryte({ aetherytes, markers, map, place })
  const shopIds = new Set([...gilShops, ...specialShops].map((s) => s["#"]))
  const lookup = {
    shops: shopIds,
    topic: byId(topics),
    pre: byId(preHandlers),
    talk: byId(talks),
    inclusion: inclusionShops(inclusions, inclusionCategories, inclusionSeries),
    fate: byId(fateShops)
  }
  // The newest tomestone of each number, the older ones were renamed into it
  const tomestones = Object.fromEntries(tomestoneItems.filter((t) => t.Tomestones !== "0").map((t) => [t.Tomestones, t.Item]))

  // Only what recipes take, what they make is crafted
  const wanted = new Set()
  const recipeDir = path.join(DATA, "crafting-recipes")
  for (const file of fs.readdirSync(recipeDir)) {
    for (const r of Object.values(JSON.parse(fs.readFileSync(path.join(recipeDir, file), "utf8")))) {
      for (const [id] of r.ingredients) wanted.add(String(id))
    }
  }

  // Shop -> what it sells: [item, currency, amount, the quest unlocking it]
  const offersOf = new Map()
  const offer = (shop, id, currency, amount, questId) => {
    if (!wanted.has(id) || !currency || !(amount > 0)) return
    const unlock = questId && questId !== "0" ? quest[questId]?.Name : null
    offersOf.set(shop, [...offersOf.get(shop) ?? [], [id, currency, amount, ...(unlock ? [unlock] : [])]])
  }
  // A GilShopItem row id is "<GilShop>.<n>"
  for (const row of shopItems) offer(row["#"].split(".")[0], row.Item, GIL, +item[row.Item]?.PriceMid, row["QuestRequired[0]"])
  for (const shop of specialShops) {
    for (let i = 0; shop[`Item[${i}].Item[0]`] !== undefined; i++) {
      const cost = shop[`Item[${i}].ItemCost[0]`]
      const questId = shop[`Item[${i}].Quest`] !== "0" ? shop[`Item[${i}].Quest`] : shop.Quest
      offer(shop["#"], shop[`Item[${i}].Item[0]`], currencyOf(shop, cost, tomestones), +shop[`Item[${i}].CurrencyCost[0]`], questId)
    }
  }

  // An NPC in several places (an event's copy, a duty's) is shown at each
  const placesOf = new Map()
  for (const l of levels) {
    if (l.Type !== NPC_LEVEL || !map[l.Map]) continue
    const zone = place[territory[l.Territory]?.PlaceName]?.Name
    if (zone) placesOf.set(l.Object, [...placesOf.get(l.Object) ?? [], { mapId: l.Map, zone, position: mapPosition(map[l.Map], l.X, l.Z) }])
  }
  // The rest are only in the zones' layouts. A few have a spare copy off the edge of the map, not a place to go to
  const laidOut = new Map()
  for (const t of territories) {
    const m = map[t.Map]
    const zone = place[t.PlaceName]?.Name
    if (!m || !zone || !t.Bg) continue
    const edge = 1 + 4100 / +m.SizeFactor
    for (const { npc, x, z } of layoutNpcs(t.Bg)) {
      if (placesOf.has(npc)) continue
      const position = mapPosition(m, x, z)
      if (position.x < 1 || position.y < 1 || position.x > edge || position.y > edge) continue
      laidOut.set(npc, [...laidOut.get(npc) ?? [], { mapId: t.Map, zone, position }])
    }
  }
  for (const [npc, list] of laidOut) placesOf.set(npc, list)

  // A few shops are only picked in the game's scripts, so no sheet links them to their NPC, see SCRIPT_SHOPS
  const shopsByNpc = new Map(npcBases.map((npc) => [npc["#"], shopsOf(npc, lookup)]))
  const linked = new Set([...shopsByNpc.values()].flat())
  for (const [shop, owners] of Object.entries(SCRIPT_SHOPS)) {
    if (linked.has(shop) || !offersOf.has(shop)) continue
    for (const npc of owners) shopsByNpc.get(String(npc))?.push(shop)
  }

  const npcs = {}
  const sold = {}
  const currencies = {}
  const mapIds = new Set()
  for (const npc of npcBases) {
    const name = npcName[npc["#"]]?.Singular
    const stock = shopsByNpc.get(npc["#"]).flatMap((s) => offersOf.get(s) ?? [])
    if (!name || !stock.length) continue
    // A second place in the same zone is the same vendor to go to
    const spots = [...new Map((placesOf.get(npc["#"]) ?? []).map((p) => [p.zone, p])).values()]
    for (const [i, { mapId, zone, position }] of spots.entries()) {
      const aetheryte = aetheryteNear(mapId, position.x, position.y)
      const key = i ? `${npc["#"]}.${i}` : npc["#"]
      npcs[key] = {
        name: name[0].toUpperCase() + name.slice(1),
        // The map's sub-name is its part of the city, not where the NPC stands, so it's left out
        zone,
        map: position,
        ...(aetheryte ? { aetheryte } : {})
      }
      mapIds.add(map[mapId].Id)
      for (const [id, currency, amount, unlock] of stock) {
        const list = sold[id] ??= []
        // The same NPC's shops can sell it twice, a copy for each tab
        if (list.some(([k, c]) => k === key && c === +currency)) continue
        list.push([key, +currency, amount, ...(unlock ? [unlock] : [])])
        if (currency !== GIL) currencies[currency] = [item[currency].Name, +item[currency].Icon]
      }
    }
  }

  // A few positions are on a map with no image, an old copy of a zone's, those vendors are left out
  const broken = new Set([...await saveMaps([...mapIds], { skipMissing: true })].map((id) => id.replace("/", "-")))
  for (const [key, npc] of Object.entries(npcs)) if (broken.has(npc.map.image)) delete npcs[key]
  for (const [id, list] of Object.entries(sold)) {
    sold[id] = list.filter(([key]) => npcs[key])
    if (!sold[id].length) delete sold[id]
  }

  const buyable = [...wanted].filter((id) => [...offersOf.values()].some((list) => list.some(([i]) => i === id)))
  console.log(`${Object.keys(sold).length} of ${buyable.length} items sold somewhere have a vendor with a place`)
  // Items -> [vendor, currency (1 for gil), amount, quest?], cheapest first
  for (const list of Object.values(sold)) list.sort((a, b) => (a[1] === +GIL ? 0 : 1) - (b[1] === +GIL ? 0 : 1))
  writeData("vendors", { npcs, items: sold, currencies })
  await saveIcons(Object.values(currencies).map(([, icon]) => icon))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
