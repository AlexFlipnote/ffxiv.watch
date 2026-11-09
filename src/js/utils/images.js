// The game's icons, maps and link previews are their own Worker, see img/wrangler.jsonc
export const IMAGES = "https://img.ffxiv.watch"

/**
 * @param {number} icon
 * @returns {string}
 */
export const gameIcon = (icon) => `${IMAGES}/game/${icon}.webp`

/**
 * @param {string} image Without .webp
 * @returns {string}
 */
export const mapImage = (image) => `${IMAGES}/maps/${image}.webp`
