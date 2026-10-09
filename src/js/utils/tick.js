import { ET_MINUTE_EARTH_MS } from "./eorzea.js"

/**
 * When what a page shows can next change: the next Earth second (the countdowns and clocks) or the next Eorzean
 * minute (windows opening and closing, the day/night phase), whichever comes first.
 * @param {number} now
 * @returns {number}
 */
const nextChange = (now) => Math.min(
  (Math.floor(now / 1000) + 1) * 1000,
  (Math.floor(now / ET_MINUTE_EARTH_MS) + 1) * ET_MINUTE_EARTH_MS
)

/**
 * Calls `fn` right away, then on the first frame after each moment the page can change (see nextChange). Waking
 * once or twice a second instead of every frame saves a phone's battery, and nothing runs while the tab is hidden.
 * @param {(now: number) => void} fn Gets `Date.now()`, should only touch the DOM when something changed
 */
export function everyTick(fn) {
  const run = () => {
    const now = Date.now()
    fn(now)
    // A timer firing a hair early reruns with nothing changed and waits again
    setTimeout(() => requestAnimationFrame(run), Math.ceil(nextChange(now) - Date.now()))
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
