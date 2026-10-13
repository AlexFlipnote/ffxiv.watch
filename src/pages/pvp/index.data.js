import { CRYSTALLINE_CONFLICT, FRONTLINE } from "../../js/utils/pvp.js"
import { html } from "../../render/html.js"

/**
 * @param {string[]} maps
 * @returns {import("../../render/html.js").Html} The rotation's order, in the page for search engines and without the script
 */
const order = (maps) => html`<ol class="pvp-order">${maps.map((m) => html`<li>${m}</li>`)}</ol>`

/**
 * @param {number} count How many maps after the current one are listed, js/pvp.js counts the rows
 * @returns {import("../../render/html.js").Html} Empty rows, so the list takes its room before the script fills it
 */
const upcoming = (count) => html`${Array.from({ length: count }, () => html`<li><time>&nbsp;</time><span>&nbsp;</span></li>`)}`

export default () => ({
  frontlineOrder: order(FRONTLINE),
  crystallineConflictOrder: order(CRYSTALLINE_CONFLICT),
  // A week of Frontline, and the next few hours of Crystalline Conflict, about a day and a third of its rotation
  frontlineUpcoming: upcoming(7),
  crystallineConflictUpcoming: upcoming(8),
  sources: ["js/utils/pvp.js"]
})
