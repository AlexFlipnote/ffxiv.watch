import { closable } from "./dialog.js"
import { coordinates, mapPercent, mapSize } from "./map.js"

const modal = document.getElementById("map-modal")
const title = document.getElementById("map-title")
const subtitle = document.getElementById("map-subtitle")
const image = document.getElementById("map-image")
const frame = document.getElementById("map-frame")
const canvas = document.getElementById("map-canvas")
const area = document.getElementById("map-area")
const pin = document.getElementById("map-pin")
const aetheryte = document.getElementById("map-aetheryte")
const aetheryteName = document.getElementById("map-aetheryte-name")
const note = document.getElementById("map-note")

const MAP_PIXELS = 1024
const MARGIN = 48
const MAX_ZOOM = 2.5
let view = { x: 0, y: 0, zoom: 1 }

/** @param {number} zoom */
const clampZoom = (zoom) => Math.min(MAX_ZOOM, Math.max(Math.max(frame.clientWidth, frame.clientHeight) / MAP_PIXELS, zoom))

/**
 * Moves and zooms the map, never so far that the frame shows past its edge.
 * @param {number} x
 * @param {number} y
 * @param {number} [zoom]
 */
function moveTo(x, y, zoom = view.zoom) {
  const width = frame.clientWidth
  const height = frame.clientHeight
  zoom = clampZoom(zoom)
  const clamp = (n, size) => Math.min(0, Math.max(size - MAP_PIXELS * zoom, n))
  view = { x: clamp(x, width), y: clamp(y, height), zoom }
  canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${zoom})`
  // The markers stay the same size on the screen, see _listing.scss
  canvas.style.setProperty("--zoom", zoom)
}

/**
 * Zooms keeping the map's point under the frame's point where it is, the mouse or between the fingers.
 * @param {number} zoom
 * @param {{ x: number, y: number }} at In the frame, where that point ends up
 * @param {{ x: number, y: number }} [from] In the frame, where it was, `at` when it didn't move
 * @param {typeof view} [start] The view it's measured from
 */
function zoomAt(zoom, at, from = at, start = view) {
  const mapX = (from.x - start.x) / start.zoom
  const mapY = (from.y - start.y) / start.zoom
  const clamped = clampZoom(zoom)
  moveTo(at.x - mapX * clamped, at.y - mapY * clamped, clamped)
}

/**
 * @param {{ clientX: number, clientY: number }} e
 * @returns {{ x: number, y: number }} Where it is in the frame
 */
function inFrame(e) {
  const rect = frame.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

/**
 * Centers the spot, or the spot and the aetheryte together when both fit.
 * @param {{ x: number, y: number }} spot In map pixels
 * @param {{ x: number, y: number }} [near] In map pixels
 */
function center(spot, near) {
  let { x, y } = spot
  if (near
    && Math.abs(near.x - spot.x) + 2 * MARGIN < frame.clientWidth
    && Math.abs(near.y - spot.y) + 2 * MARGIN < frame.clientHeight) {
    x = (spot.x + near.x) / 2
    y = (spot.y + near.y) / 2
  }
  moveTo(frame.clientWidth / 2 - x, frame.clientHeight / 2 - y, 1)
}

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
  const pixels = (spot) => ({ x: mapPercent(map, spot.x) / 100 * MAP_PIXELS, y: mapPercent(map, spot.y) / 100 * MAP_PIXELS })

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
  // Once it's on the page, the frame has no size before
  center(pixels(map), entry.aetheryte && pixels(entry.aetheryte))
}

for (const event of ["load", "error"]) image.addEventListener(event, () => frame.classList.remove("map-loading"))

// The wheel zooms where the mouse is, so does pinching a laptop's touchpad, which the browser sends as a wheel with ctrl
frame.addEventListener("wheel", (e) => {
  e.preventDefault()
  // Firefox can count in lines
  const delta = e.deltaY * (e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1)
  zoomAt(view.zoom * Math.exp(-delta * (e.ctrlKey ? .01 : .002)), inFrame(e))
}, { passive: false })

// Each finger put down or lifted starts the gesture over from where it is
const pointers = new Map()
let gesture = null

function startGesture() {
  const points = [...pointers.values()]
  const [a, b] = points
  gesture = {
    view,
    middle: b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a,
    spread: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }
}

frame.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return
  frame.setPointerCapture(e.pointerId)
  frame.classList.add("map-dragging")
  pointers.set(e.pointerId, inFrame(e))
  startGesture()
})

frame.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, inFrame(e))
  const [a, b] = pointers.values()
  const middle = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a
  const zoom = b && gesture.spread ? gesture.view.zoom * Math.hypot(a.x - b.x, a.y - b.y) / gesture.spread : gesture.view.zoom
  zoomAt(zoom, middle, gesture.middle, gesture.view)
})

for (const event of ["pointerup", "pointercancel"]) {
  frame.addEventListener(event, (e) => {
    if (!pointers.delete(e.pointerId)) return
    if (pointers.size) startGesture()
    else frame.classList.remove("map-dragging")
  })
}

// A phone turned sideways, say, the frame changes size and the map could end up short of its edge
new ResizeObserver(() => moveTo(view.x, view.y)).observe(frame)

closable(modal, document.getElementById("map-close"))
