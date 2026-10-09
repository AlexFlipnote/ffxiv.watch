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
export const mapPercent = (map, coord) => (coord - 1) * map.scale / 41

/**
 * @param {MapSpot} map
 * @param {number} distance In map units
 * @returns {number} % of the map image's width
 */
export const mapSize = (map, distance) => distance * map.scale / 41

/**
 * @param {{ x: number, y: number }} spot
 * @returns {string} "X: 21.8 Y: 22.2", like the game shows them
 */
export const coordinates = (spot) => `X: ${spot.x.toFixed(1)} Y: ${spot.y.toFixed(1)}`
