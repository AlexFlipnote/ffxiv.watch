// Light/dark theme, applied before the first paint by partials/head.html. Follows the system until someone picks one

const KEY = "theme"
const root = document.documentElement
const system = matchMedia("(prefers-color-scheme: light)")
const themeColor = document.querySelector("meta[name=theme-color]")
const button = document.querySelector(".theme-toggle")

function saved() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function apply(theme) {
  // Switch instantly instead of through the 8s day/night fade
  const fading = root.classList.contains("daynight-fade")
  root.classList.remove("daynight-fade")
  root.dataset.theme = theme
  if (fading) requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("daynight-fade")))

  themeColor.content = theme === "light" ? "#f7f7f7" : "#181818"
  button.setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme")
  button.title = button.getAttribute("aria-label")
}

button.addEventListener("click", () => {
  const theme = root.dataset.theme === "light" ? "dark" : "light"
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Storage blocked, just not saved
  }
  apply(theme)
})

system.addEventListener("change", () => {
  if (!["light", "dark"].includes(saved())) apply(system.matches ? "light" : "dark")
})

apply(root.dataset.theme)
