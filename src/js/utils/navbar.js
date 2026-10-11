import "./haptics.js"
import "./theme.js"
import { openSettings } from "./settings.js"

const navbar = document.querySelector(".navbar")
const hamburger = navbar.querySelector(".navbar-hamburger")

/** @param {boolean} opened */
function setOpened(opened) {
  navbar.classList.toggle("opened", opened)
  hamburger.setAttribute("aria-expanded", opened)
}

hamburger.addEventListener("click", () => setOpened(!navbar.classList.contains("opened")))

// The backdrop covers the page while the menu is open, so a tap next to it only closes it
navbar.querySelector(".navbar-backdrop").addEventListener("click", () => setOpened(false))

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setOpened(false)
})

navbar.querySelector(".settings-button").addEventListener("click", () => {
  setOpened(false)
  openSettings()
})
