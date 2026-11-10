import { CRAFTER_KEY } from "./utils/crafting.js"
import { backlink } from "./utils/detail.js"
import { addDialog } from "./utils/list-add.js"
import { craftTreeButton, el, planView } from "./utils/planner.js"
import { load, onStored } from "./utils/storage.js"

// A recipe page: its planner, the crafter picks and adding it to a list

backlink()

// Hidden for a recipe made only from what's gathered or bought, the lists still read its data
const section = /** @type {HTMLElement | null} */ (document.querySelector(".crafting-full[data-planner]"))
const data = section && JSON.parse(section.dataset.planner)
const gotten = new Set()
const plan = section && !section.hidden ? planner(section, data, gotten) : null
if (data) listButton(data, gotten)
crafterPicks(plan)

/**
 * @param {HTMLElement} section
 * @param {object} data
 * @param {Set<number>} gotten
 * @returns {{ pickCrafter: (job: string) => void }}
 */
function planner(section, data, gotten) {
  const root = data.root
  const rootInfo = data.items[root]
  const view = planView({ data, roots: () => [[root, 1]], gotten })

  const title = section.querySelector("h2")
  const head = el("div", "planner-head")
  title.before(head)
  const text = () => `1x ${rootInfo[0]}\n${location.origin}${location.pathname}\n\n${view.text()}`
  head.append(title, el("div", "planner-head-actions", [craftTreeButton(() => view.tree, text)]))
  section.querySelector(".planner-body").replaceWith(el("div", "planner-body", [view.summary]))

  view.draw()
  return {
    pickCrafter: (job) => {
      if (!data.crafters?.[job]) return
      data.recipes[root] = data.crafters[job]
      view.draw()
    }
  }
}

/**
 * The add to list button beside the item's name.
 * @param {object} data
 * @param {Set<number>} gotten
 */
function listButton(data, gotten) {
  const button = /** @type {HTMLElement | null} */ (document.querySelector(".title-list-add"))
  if (!button) return
  const [name, icon] = data.items[data.root]
  button.style.setProperty("--icon", "url(\"/images/ui/list-add.svg\")")
  button.hidden = false
  let open = null
  button.addEventListener("click", () => {
    open ??= addDialog({ slug: data.slug, name, icon, item: data.root }, gotten)
    open()
  })
}

/**
 * Shows the picked crafter's crystals and book, the preferred one to start with.
 * @param {{ pickCrafter: (job: string) => void } | null} plan
 */
function crafterPicks(plan) {
  const selects = [...document.querySelectorAll("select.crafting-job")]
  const pick = (select, i) => {
    for (const part of select.closest(".crafting-recipe").querySelectorAll("[data-job]")) part.hidden = part.dataset.job !== select.value
    if (i === 0) plan?.pickCrafter(select.value)
  }
  const preferred = () => {
    const job = load(CRAFTER_KEY)
    for (const [i, select] of selects.entries()) {
      const there = [...select.options].some((o) => o.value === job)
      select.value = there ? job : select.options[0].value
      pick(select, i)
    }
  }
  for (const [i, select] of selects.entries()) select.addEventListener("change", () => pick(select, i))
  if (load(CRAFTER_KEY)) preferred()
  onStored(CRAFTER_KEY, preferred)
}
