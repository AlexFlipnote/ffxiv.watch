import crypto from "crypto"
import fs from "fs"
import path from "path"
import sharp from "sharp"
import { fileURLToPath } from "url"
import { coordinates, mapPercent, mapSize } from "../js/utils/map.js"

/*
  Link preview images. A vista gets its map, cut to the 1.91:1 shape large previews use, with its marker and aetheryte.
  An item gets its icon, 200px square, the smallest every site takes. A weather zone gets its loading screen with its
  name over it, as the game shows it on arrival. The pages ask for one while they render and get its URL, build.js then
  writes them all. Pages that would look the same share one.
*/

const IMAGES = path.join(path.dirname(fileURLToPath(import.meta.url)), "../images")

// The map's full width, so it's never scaled, and as tall as 1.91:1 makes it
const MAP_PIXELS = 1024
const OG_WIDTH = 1024
const OG_HEIGHT = 536
const ICON_SIZE = 200
// The most a zone's name takes up, the longest ones are scaled down to it
const NAME_WIDTH = 880
const NAME_HEIGHT = 120

// "/images/og/hash.jpg" -> what it shows, filled while the pages render
const images = new Map()
// "/images/og/icon-22408.jpg" -> the icon
const icons = new Map()
// "/images/og/zone-123741.webp" -> its art, see weather-art.json
const zones = new Map()

/**
 * What a page passes to <x-seo>.
 * @typedef {{ image: string, imageAlt: string, imageSize: string }} OgImage imageSize is "1024x536", all empty for
 * none, which gives the site's banner
 */

/**
 * @param {{ zone: string, map: import("../js/utils/map.js").MapSpot, aetheryte?: { x: number, y: number } }} entry
 * @returns {OgImage} Its map, empty without one
 */
export function ogImage(entry) {
  if (!entry.map) return { image: "", imageAlt: "", imageSize: "" }
  const { image, scale, x, y, radius } = entry.map
  const spec = { image, scale, x, y, radius, aetheryte: entry.aetheryte && { x: entry.aetheryte.x, y: entry.aetheryte.y } }
  const url = `/images/og/${crypto.createHash("md5").update(JSON.stringify(spec)).digest("hex").slice(0, 12)}.jpg`
  images.set(url, spec)
  return { image: url, imageAlt: `Map of ${entry.zone}, marked at ${coordinates(entry.map)}`, imageSize: `${OG_WIDTH}x${OG_HEIGHT}` }
}

/**
 * @param {number} icon Item.Icon, see saveIcons in scripts/datamining.js
 * @param {string} name The item's
 * @returns {OgImage}
 */
export function ogIcon(icon, name) {
  const url = `/images/og/icon-${icon}.jpg`
  icons.set(url, icon)
  return { image: url, imageAlt: `${name} icon`, imageSize: `${ICON_SIZE}x${ICON_SIZE}` }
}

/**
 * WebP, which Discord shows, to keep the loading screens' detail small.
 * @param {string} zone
 * @param {{ loading: string, name: number } | undefined} art From weather-art.json
 * @returns {OgImage} Empty without art
 */
export function ogZone(zone, art) {
  if (!art) return { image: "", imageAlt: "", imageSize: "" }
  const url = `/images/og/zone-${art.name}.webp`
  zones.set(url, art)
  return { image: url, imageAlt: `${zone}, as the game shows it on arrival`, imageSize: `${OG_WIDTH}x${OG_HEIGHT}` }
}

/**
 * @param {string} file In src/images/
 * @param {string} attrs Where to draw it: `x="0" y="0" width="10" height="10"`
 * @returns {string} The SVG with a shadow, to nest in another one. The shadow is on a group around it, librsvg
 * leaves out a nested <svg> with a filter of its own
 */
const nestedSvg = (file, attrs) => `<g filter="url(#shadow)">${fs.readFileSync(path.join(IMAGES, file), "utf8")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<svg\b/, `<svg ${attrs}`)}</g>`

/**
 * @param {object} spec One of images
 * @param {number} top Where the cut starts on the map, in pixels
 * @returns {string} The marker, aetheryte and logo, the size of the image
 */
function overlay(spec, top) {
  const px = (coord) => mapPercent(spec, coord) / 100 * MAP_PIXELS
  const [x, y] = [px(spec.x), px(spec.y) - top]
  const marker = spec.radius
    ? `<circle cx="${x}" cy="${y}" r="${Math.max(mapSize(spec, spec.radius) / 100 * MAP_PIXELS, 20)}" fill="rgba(176, 49, 49, .25)" stroke="rgba(176, 49, 49, .8)" stroke-width="4"/>`
    : `<circle cx="${x}" cy="${y}" r="10" fill="#b03131" stroke="#fff" stroke-width="4" filter="url(#shadow)"/>`
  // 24x32, scaled up like the marker
  const aetheryte = spec.aetheryte
    ? nestedSvg("ui/map-aetheryte.svg", `x="${px(spec.aetheryte.x) - 18}" y="${px(spec.aetheryte.y) - top - 24}" width="36" height="48"`)
    : ""

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}">
    <defs>
      <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
        <feComponentTransfer><feFuncA type="linear" slope=".6"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    ${aetheryte}
    ${marker}
    ${nestedSvg("logo.svg", `x="24" y="${OG_HEIGHT - 96}" width="72" height="72"`)}
  </svg>`
}

/**
 * @param {object} spec One of images
 * @param {string} file Where it goes
 */
async function writeImage(spec, file) {
  // The spot in the middle, unless that would go past the map's edge
  const y = mapPercent(spec, spec.y) / 100 * MAP_PIXELS
  const top = Math.round(Math.min(Math.max(y - OG_HEIGHT / 2, 0), MAP_PIXELS - OG_HEIGHT))

  await sharp(path.join(IMAGES, "maps", `${spec.image}.webp`))
    .extract({ left: 0, top, width: OG_WIDTH, height: OG_HEIGHT })
    .composite([{ input: Buffer.from(overlay(spec, top)) }])
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(file)
}

/**
 * @param {number} icon
 * @param {string} file Where it goes
 */
async function writeIcon(icon, file) {
  // Scaled up from the game's 80px, on the site's background where the icon's corners are see-through
  await sharp(path.join(IMAGES, "game", `${icon}.webp`))
    .resize(ICON_SIZE, ICON_SIZE, { kernel: "lanczos3" })
    .flatten({ background: "#1a1a1a" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(file)
}

/**
 * @param {{ loading: string, name: number }} art
 * @param {string} file Where it goes
 */
async function writeZone(art, file) {
  const { data: name, info } = await sharp(path.join(IMAGES, "zones/names", `${art.name}.webp`))
    .resize(NAME_WIDTH, NAME_HEIGHT, { fit: "inside", withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true })
  // A dark band behind the name, the gold lettering gets lost on the brighter paintings
  const shade = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}">
    <defs>
      <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0"/>
        <stop offset=".5" stop-color="#000" stop-opacity=".5"/>
        <stop offset="1" stop-color="#000" stop-opacity="0"/>
      </linearGradient>
      <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
        <feComponentTransfer><feFuncA type="linear" slope=".6"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect y="${OG_HEIGHT / 2 - 130}" width="${OG_WIDTH}" height="260" fill="url(#band)"/>
    ${nestedSvg("logo.svg", `x="24" y="${OG_HEIGHT - 96}" width="72" height="72"`)}
  </svg>`

  // Saved at the preview's size, see saveZoneArt in scripts/datamining.js
  await sharp(path.join(IMAGES, "zones/loading", `${art.loading}.webp`))
    .composite([
      { input: Buffer.from(shade) },
      { input: name, left: Math.round((OG_WIDTH - info.width) / 2), top: Math.round((OG_HEIGHT - info.height) / 2) }
    ])
    .webp({ quality: 72, effort: 6 })
    .toFile(file)
}

/**
 * Writes every image the pages asked for.
 * @param {string} out The build folder
 * @returns {Promise<number>} How many
 */
export async function writeOgImages(out) {
  fs.mkdirSync(path.join(out, "images/og"), { recursive: true })
  const queue = [
    ...[...images].map(([url, spec]) => () => writeImage(spec, path.join(out, url))),
    ...[...icons].map(([url, icon]) => () => writeIcon(icon, path.join(out, url))),
    ...[...zones].map(([url, art]) => () => writeZone(art, path.join(out, url)))
  ]
  const count = queue.length
  // A few at a time, sharp works on its own threads anyway
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) await queue.pop()()
  }))
  return count
}
