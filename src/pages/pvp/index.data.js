import { CRYSTALLINE_CONFLICT, FRONTLINE } from "../../js/utils/pvp.js"
import { html } from "../../render/html.js"

/**
 * @param {string[]} maps
 * @returns {import("../../render/html.js").Html} The rotation's order, in the page for search engines and without the script
 */
const order = (maps) => html`<ol class="pvp-order">${maps.map((m) => html`<li>${m}</li>`)}</ol>`

export default () => ({
  frontlineOrder: order(FRONTLINE),
  crystallineConflictOrder: order(CRYSTALLINE_CONFLICT),
  sources: ["js/utils/pvp.js"]
})
