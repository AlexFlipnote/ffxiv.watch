import { buzz } from "./haptics.js"
import { toast } from "./toast.js"

const SPARKS = 8
// How long the sparks and the pop take, see .done-check in _controls.scss
export const CELEBRATE_MS = 600

/**
 * A pop, a burst of sparks and a buzz when it's checked, a quick shrink when it's unchecked.
 * @param {HTMLButtonElement} button
 * @param {boolean} isDone
 */
function celebrate(button, isDone) {
  button.classList.remove("done-pop", "done-unpop")
  // Restarts the animation when it's clicked again before it ended
  void button.offsetWidth
  button.classList.add(isDone ? "done-pop" : "done-unpop")
  buzz(isDone ? [12, 60, 12] : 10)
  if (!isDone) return

  const burst = document.createElement("span")
  burst.className = "done-burst"
  burst.setAttribute("aria-hidden", "true")
  for (let i = 0; i < SPARKS; i++) {
    const spark = document.createElement("span")
    spark.style.setProperty("--angle", `${i * (360 / SPARKS)}deg`)
    burst.append(spark)
  }
  button.append(burst)
  setTimeout(() => burst.remove(), CELEBRATE_MS)
}

/**
 * Hooks up the page's done checks (doneButton in src/render/html.js). They're kept in localStorage as the ids joined
 * with dots, and a row fades once all its checks are done. Fires "done-change" on the document after each change.
 * @param {string} key "vistas", "fish", "gathering"
 */
export function doneChecks(key) {
  const storageKey = `done-${key}`
  const buttons = [...document.querySelectorAll(".done-check")]
  const rows = [...new Set(buttons.map((b) => b.closest("tr")).filter(Boolean))]

  /** @returns {Set<number>} */
  const read = () => {
    try {
      const value = localStorage.getItem(storageKey)
      return new Set(value ? value.split(".").map(Number).filter(Number.isInteger) : [])
    } catch {
      return new Set()
    }
  }

  let done = read()

  const show = () => {
    for (const button of buttons) {
      const isDone = done.has(Number(button.dataset.doneId))
      button.setAttribute("aria-pressed", isDone)
      button.title = isDone ? "Complete, click to undo" : "Mark as complete"
    }
    for (const tr of rows) {
      tr.toggleAttribute("data-done", [...tr.querySelectorAll(".done-check")].every((b) => b.getAttribute("aria-pressed") === "true"))
    }
    document.dispatchEvent(new Event("done-change"))
  }

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const id = Number(button.dataset.doneId)
      const isDone = !done.delete(id)
      if (isDone) done.add(id)
      try {
        localStorage.setItem(storageKey, [...done].sort((a, b) => a - b).join("."))
      } catch {
        // Storage blocked, it lasts until the page is left
      }
      show()
      celebrate(button, isDone)
      toast(`Marked ${button.dataset.name} as ${isDone ? "complete" : "not complete"}`, { tone: isDone ? "success" : "info" })
    })
  }

  // Ticked off in another tab
  addEventListener("storage", (e) => {
    if (e.key !== storageKey) return
    done = read()
    show()
  })

  show()
}
