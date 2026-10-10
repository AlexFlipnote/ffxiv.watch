import "./utils/backlink.js"
import "./utils/mapZoom.js"
import "./utils/navbar.js"
import { applyDayNight } from "./utils/daynight.js"
import { detailTimers } from "./utils/detail.js"
import { doneChecks } from "./utils/done.js"
import { cachedWeatherWindows, nextWeatherWindow } from "./utils/windows.js"
import { everyTick } from "./utils/tick.js"

// The vista's time and weather, when it needs either
const render = detailTimers((vista) => {
  const current = cachedWeatherWindows()
  return {
    current: (now) => current(vista, now),
    after: (from) => nextWeatherWindow(vista, from)
  }
})

doneChecks("vistas")

everyTick((now) => {
  render(now)
  applyDayNight(now)
})
