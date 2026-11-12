// The game's icons and maps, saved by scripts/sources/game.js
export const IMAGES = "/images"

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
