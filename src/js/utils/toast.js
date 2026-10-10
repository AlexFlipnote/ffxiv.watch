const MAX_SHOWN = 3

// Made up front, a screen reader only reads what's added to a live region that was already there
const region = document.createElement("div")
region.className = "toasts"
region.setAttribute("role", "status")
document.body.append(region)

/**
 * Shows a short message in the corner, gone after a while or when closed.
 * @param {string} text
 * @param {{ duration?: number, tone?: "info" | "success" | "warning" }} [options] `duration` in ms
 */
export function toast(text, { duration = 4000, tone = "info" } = {}) {
  const el = document.createElement("div")
  el.className = `toast toast-${tone}`
  el.innerHTML = `
    <span class="toast-text"></span>
    <button class="toast-close" aria-label="Dismiss"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  `
  el.querySelector(".toast-text").textContent = text
  region.append(el)
  while (region.children.length > MAX_SHOWN) region.firstElementChild.remove()

  const close = () => {
    clearTimeout(timer)
    el.classList.add("toast-leaving")
    setTimeout(() => el.remove(), 200)
  }
  const timer = setTimeout(close, duration)
  el.querySelector(".toast-close").addEventListener("click", close)
}
