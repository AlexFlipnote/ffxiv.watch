/**
 * @typedef {object} MapSpot
 * @property {string} image File name in /images/maps/, without .webp
 * @property {number} scale The map's size factor, 100 is 41 map units across
 * @property {number} x In-game map X, 1.0 at the left edge
 * @property {number} y In-game map Y, 1.0 at the top edge
 * @property {number} radius How far from x/y it can be, in map units. 0 for an exact spot
 */

/**
 * @param {MapSpot} map
 * @param {number} coord An in-game map X or Y
 * @returns {number} % across the map image
 */
const mapPercent = (map, coord) => (coord - 1) * map.scale / 41

/**
 * @param {MapSpot} map
 * @param {number} distance In map units
 * @returns {number} % of the map image's width
 */
const mapSize = (map, distance) => distance * map.scale / 41

const modal = document.getElementById("map-modal")
const title = document.getElementById("map-title")
const subtitle = document.getElementById("map-subtitle")
const image = document.getElementById("map-image")
const area = document.getElementById("map-area")
const pin = document.getElementById("map-pin")
const note = document.getElementById("map-note")

/**
 * Opens the dialog with the zone's map, a pin, and a circle for the area when there's a radius.
 * @param {{ zone: string, spot?: string, map: MapSpot, note?: string | (string | Node)[] }} entry `note` is shown under the coordinates
 */
export function openMap(entry) {
  const { map } = entry
  const place = (el) => {
    el.style.left = `${mapPercent(map, map.x)}%`
    el.style.top = `${mapPercent(map, map.y)}%`
  }

  title.textContent = entry.zone
  subtitle.textContent = `${entry.spot ? `${entry.spot}, ` : ""}X: ${map.x.toFixed(1)} Y: ${map.y.toFixed(1)}`
  image.src = `/images/maps/${map.image}.webp`
  image.alt = `Map of ${entry.zone}`

  area.hidden = !map.radius
  area.style.width = area.style.height = `${2 * mapSize(map, map.radius)}%`
  place(area)
  place(pin)

  note.replaceChildren(...[entry.note ?? []].flat())
  note.hidden = !entry.note
  modal.showModal()
}

document.getElementById("map-close").addEventListener("click", () => modal.close())

// Clicking the backdrop closes it
modal.addEventListener("click", (e) => {
  const rect = modal.getBoundingClientRect()
  if (e.clientY < rect.top || e.clientY > rect.bottom || e.clientX < rect.left || e.clientX > rect.right) {
    modal.close()
  }
})
