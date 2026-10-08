import "./utils/navbar.js"
import { applyDayNight } from "./utils/daynight.js"
import { everyFrame } from "./utils/tick.js"

everyFrame(applyDayNight)
