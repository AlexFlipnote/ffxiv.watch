import "./utils/navbar.js"
import { applyDayNight } from "./utils/daynight.js"
import { everyTick } from "./utils/tick.js"

everyTick(applyDayNight)
