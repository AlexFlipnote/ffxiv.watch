import { coordinates, mapPercent, mapSize } from "./map.js"

const modal = document.getElementById("map-modal")
const title = document.getElementById("map-title")
const subtitle = document.getElementById("map-subtitle")
const image = document.getElementById("map-image")
const frame = image.parentElement
const area = document.getElementById("map-area")
const pin = document.getElementById("map-pin")
const aetheryte = document.getElementById("map-aetheryte")
const aetheryteName = document.getElementById("map-aetheryte-name")
const note = document.getElementById("map-note")

/**
 * Opens the dialog with the zone's map, a circle for the area when there's a radius or a pin when it's an exact spot,
 * and the nearest aetheryte.
 * @param {{ zone: string, spot?: string, map: import("./map.js").MapSpot, aetheryte?: { name: string, x: number, y: number }, note?: string | (string | Node)[] }} entry
 * `note` is shown under the coordinates
 */
export function openMap(entry) {
  const { map } = entry
  const place = (el, spot) => {
    el.style.left = `${mapPercent(map, spot.x)}%`
    el.style.top = `${mapPercent(map, spot.y)}%`
  }

  title.textContent = entry.zone
  subtitle.textContent = `${entry.spot ? `${entry.spot}, ` : ""}${coordinates(map)}`
  // Another zone's map would sit there until the new one loads, so it's a blank pulsing square until then
  const src = `/images/maps/${map.image}.webp`
  if (image.getAttribute("src") !== src) {
    frame.classList.add("map-loading")
    image.src = src
    if (image.complete) frame.classList.remove("map-loading")
  }
  image.alt = `Map of ${entry.zone}`

  area.hidden = !map.radius
  area.style.width = area.style.height = `${2 * mapSize(map, map.radius)}%`
  place(area, map)
  pin.hidden = Boolean(map.radius)
  place(pin, map)

  // Written out too, a phone can't hover the marker for its title
  aetheryte.hidden = aetheryteName.hidden = !entry.aetheryte
  if (entry.aetheryte) {
    place(aetheryte, entry.aetheryte)
    aetheryte.title = `${entry.aetheryte.name} aetheryte`
    aetheryteName.textContent = `Nearest aetheryte: ${entry.aetheryte.name}`
  }

  note.replaceChildren(...[entry.note ?? []].flat())
  note.hidden = !entry.note
  modal.showModal()
}

for (const event of ["load", "error"]) image.addEventListener(event, () => frame.classList.remove("map-loading"))

document.getElementById("map-close").addEventListener("click", () => modal.close())

// Clicking the backdrop closes it
modal.addEventListener("click", (e) => {
  if (e.target !== modal) return
  const rect = modal.getBoundingClientRect()
  if (e.clientY < rect.top || e.clientY > rect.bottom || e.clientX < rect.left || e.clientX > rect.right) {
    modal.close()
  }
})
