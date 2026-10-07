import "./utils/navbar.js"
import { applyDayNight } from "./utils/daynight.js"
import { tick } from "./utils/tick.js"

tick(1000, applyDayNight)
