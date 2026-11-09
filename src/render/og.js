import fs from "fs"
import path from "path"
import sharp from "sharp"
import { fileURLToPath } from "url"
import { gameIcon, IMAGES as IMAGE_HOST } from "../js/utils/images.js"

// Link preview images: an item or vista is its game icon as it is, a weather zone its loading screen with its name over
// it. The pages ask for a zone's while they render, scripts/build-images.js then writes them

const IMAGES = path.join(path.dirname(fileURLToPath(import.meta.url)), "../images")

const OG_WIDTH = 1024
const OG_HEIGHT = 536
// The most a zone's name takes up, the longest ones are scaled down to it
const NAME_WIDTH = 880
const NAME_HEIGHT = 120

// ".../og/zone-123741.webp" -> its art, see weather-art.json
const zones = new Map()

/**
 * What a page passes to <x-seo>.
 * @typedef {{ image: string, imageAlt: string, imageSize: string }} OgImage imageSize is "1024x536", all empty for
 * none, which gives the site's banner
 */

/**
 * The game's 80px icon, Discord shows a square one as a small thumbnail anyway.
 * @param {number} icon
 * @param {string} name
 * @returns {OgImage}
 */
export const ogIcon = (icon, name) => ({ image: gameIcon(icon), imageAlt: `${name} icon`, imageSize: "80x80" })

/**
 * WebP, which Discord shows, to keep the loading screens' detail small.
 * @param {string} zone
 * @param {{ loading: string, name: number } | undefined} art From weather-art.json
 * @returns {OgImage} Empty without art
 */
export function ogZone(zone, art) {
  if (!art) return { image: "", imageAlt: "", imageSize: "" }
  const url = `${IMAGE_HOST}/og/zone-${art.name}.webp`
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
 * Writes every image the pages asked for, see scripts/build-images.js.
 * @param {string} dir
 * @returns {Promise<number>} How many
 */
export async function writeOgImages(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const fileOf = (url) => path.join(dir, path.basename(url))
  const queue = [
    ...[...zones].map(([url, art]) => () => writeZone(art, fileOf(url)))
  ]
  const count = queue.length
  // A few at a time, sharp works on its own threads anyway
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) await queue.pop()()
  }))
  return count
}
