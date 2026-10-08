/**
 * Calls `fn` every animation frame, pausing while the tab is hidden.
 * @param {(now: number) => void} fn Gets `Date.now()`, should only touch the DOM when something changed
 */
export function everyFrame(fn) {
  const run = () => {
    fn(Date.now())
    requestAnimationFrame(run)
  }
  run()
}

/**
 * Sets an element's text, skipping the write when it's already that.
 * @param {HTMLElement} el
 * @param {string} text
 */
export function setText(el, text) {
  if (el.textContent !== text) el.textContent = text
}
