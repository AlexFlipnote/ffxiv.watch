import { bannerOf, CRYSTALLINE_CONFLICT, FRONTLINE, MODES, modeOf } from "../js/utils/pvp.js"

export const sources = ["js/utils/pvp.js", "js/data/pvp.json"]

/**
 * @param {string[]} maps
 * @returns {{ n: number, name: string, banner: string, mode: { name: string, index: number } | null }[]} The order the
 *   pages list, in the HTML for search engines and before the script
 */
const cycle = (maps) => maps.map((name, i) => ({ n: i + 1, name, banner: bannerOf(name), mode: modeOf(name) }))

/** The rotations as the PvP pages write them out, js/pvp.js and js/pvp-schedule.js fill in what's on when. */
export default {
  modes: MODES.map((name, index) => ({ name, index })),
  frontline: { cycle: cycle(FRONTLINE.maps), length: FRONTLINE.maps.length },
  crystallineConflict: { cycle: cycle(CRYSTALLINE_CONFLICT.maps), length: CRYSTALLINE_CONFLICT.maps.length }
}
