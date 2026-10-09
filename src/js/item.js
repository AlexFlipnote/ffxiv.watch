import "./utils/backlink.js"
import "./utils/mapZoom.js"
import "./utils/navbar.js"
import { applyDayNight } from "./utils/daynight.js"
import { detailTimers } from "./utils/detail.js"
import { nextWindow } from "./utils/gathering.js"
import { everyTick } from "./utils/tick.js"

// A timer for each of the item's nodes that has times, the always up ones have none
const render = detailTimers((node) => ({
  current: (now) => nextWindow(node, now),
  after: (from) => nextWindow(node, from)
}))

everyTick((now) => {
  render(now)
  applyDayNight(now)
})
