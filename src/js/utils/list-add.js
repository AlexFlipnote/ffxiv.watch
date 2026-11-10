import { closable } from "./dialog.js"
import { activeList, addToList, freeName, NAME_LENGTH, NEW_LIST, readLists } from "./lists.js"
import { el, stepper } from "./planner.js"
import { toast } from "./toast.js"

// Adding a recipe to a list: the button by a recipe page's title and the one on each row of /crafting/

/**
 * @param {Omit<import("./lists.js").ListItem, "amount">} item
 * @param {Set<number>} gotten
 * @returns {() => void} Opens the dialog asking how many and onto which list
 */
export function addDialog(item, gotten) {
  let amount = 1
  const count = stepper(amount, `How many ${item.name}`, (n) => {
    amount = n
  })
  const pick = el("select", "select")
  pick.setAttribute("aria-label", "List")
  const name = Object.assign(el("input", "input"), { type: "text", maxLength: NAME_LENGTH, placeholder: "My list", enterKeyHint: "done" })
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
