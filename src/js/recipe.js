import { CRAFTER_KEY } from "./utils/crafting.js"
import { backlink } from "./utils/detail.js"
import { closable } from "./utils/dialog.js"
import { activeList, addToList, freeName, NEW_LIST, readLists } from "./utils/lists.js"
import { craftTreeButton, el, planView, stepper } from "./utils/planner.js"
import { load, onStored } from "./utils/storage.js"
import { toast } from "./utils/toast.js"

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
 * @param {Omit<import("./utils/lists.js").ListItem, "amount">} item
 * @param {Set<number>} gotten
 * @returns {() => void} Opens the dialog asking how many and onto which list
 */
function addDialog(item, gotten) {
  let amount = 1
  const count = stepper(amount, `How many ${item.name}`, (n) => {
    amount = n
  })
  const pick = el("select", "select")
  pick.setAttribute("aria-label", "List")
  const name = Object.assign(el("input", "input"), { type: "text", maxLength: 60, placeholder: "My list", enterKeyHint: "done" })
  name.setAttribute("aria-label", "New list's name")
  const nameRow = el("label", "list-add-row", [el("span", "", ["Name"]), name])
  const submit = Object.assign(el("button", "solid-button"), { type: "button" })
  const close = Object.assign(el("button", "close-btn", ["×"]), { type: "button" })
  close.setAttribute("aria-label", "Close")

  const dialog = /** @type {HTMLDialogElement} */ (el("dialog", "modal list-add-modal", [
    el("div", "modal-header", [el("h2", "title", [`Add ${item.name}`]), close]),
    el("div", "list-add-row", [el("span", "", ["How many"]), count.el]),
    el("label", "list-add-row", [el("span", "", ["List"]), pick]),
    nameRow,
    el("div", "list-add-actions", [submit])
  ]))
  dialog.setAttribute("closedby", "any")
  dialog.setAttribute("aria-label", `Add ${item.name} to a list`)
  document.body.append(dialog)
  closable(dialog, close)

  const creating = () => {
    const isNew = pick.value === NEW_LIST
    nameRow.hidden = !isNew
    submit.textContent = isNew ? "Create list" : "Add to list"
  }
  pick.addEventListener("change", creating)

  const add = () => {
    const list = addToList(pick.value, { ...item, amount }, [...gotten], name.value)
    dialog.close()
    toast(`Added ${amount} ${item.name} to ${list.name}`, { tone: "success" })
  }
  submit.addEventListener("click", add)
  name.addEventListener("keydown", (e) => {
    if (e.key === "Enter") add()
  })

  return () => {
    const state = readLists()
    const active = activeList(state)
    pick.replaceChildren(
      ...state.lists.map((l) => Object.assign(el("option", "", [l.name]), { value: l.id, selected: l.id === active?.id })),
      Object.assign(el("option", "planner-new-option", ["Create a new list..."]), { value: NEW_LIST, selected: !active })
    )
    name.value = ""
    name.placeholder = freeName(state.lists)
    amount = 1
    count.set(1)
    creating()
    dialog.showModal()
  }
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
