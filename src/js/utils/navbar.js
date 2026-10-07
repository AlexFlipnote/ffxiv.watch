// Mobile menu, and the theme toggle. Every page imports this once

import "./theme.js"

const navbar = document.querySelector(".navbar")
const hamburger = navbar.querySelector(".navbar-hamburger")

function setOpened(opened) {
  navbar.classList.toggle("opened", opened)
  hamburger.setAttribute("aria-expanded", opened)
}

hamburger.addEventListener("click", (e) => {
  e.stopPropagation()
  setOpened(!navbar.classList.contains("opened"))
})

window.addEventListener("click", (e) => {
  if (!navbar.contains(e.target)) setOpened(false)
})

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setOpened(false)
})
