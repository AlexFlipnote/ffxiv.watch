const TAPPABLE = [
  ".info-btn", ".region-btn", ".close-btn", ".toast-close",
  ".navbar-hamburger", ".navbar-links a", ".theme-toggle",
  ".location[href]", ".map-zoom",
  ".filters-toggle", ".top-button", ".hide-done input",
  ".backlink", ".detail-prev-link", ".detail-next-link"
].join(", ")

/**
 * A buzz on the phones that can. Short is soft, the API has no strength. Silent mode mutes it on Android, iPhones
 * can't at all.
 * @param {number | number[]} [pattern] ms on, off, on...
 */
export const buzz = (pattern = 10) => navigator.vibrate?.(pattern)

document.addEventListener("click", (e) => {
  if (e.target.closest(TAPPABLE)) buzz()
})
