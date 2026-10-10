import "./utils/backlink.js"
import "./utils/mapZoom.js"
import "./utils/navbar.js"
import { applyDayNight } from "./utils/daynight.js"
import { detailTimers } from "./utils/detail.js"
import { doneChecks } from "./utils/done.js"
import { everyTick } from "./utils/tick.js"
import { cachedWeatherWindows, nextWeatherWindow } from "./utils/windows.js"

// The fish's time and weather, when it needs either
const render = detailTimers((fish) => {
  const current = cachedWeatherWindows()
  return {
    current: (now) => current(fish, now),
    after: (from) => nextWeatherWindow(fish, from)
  }
})

doneChecks("fish")

everyTick((now) => {
  render(now)
  applyDayNight(now)
})
