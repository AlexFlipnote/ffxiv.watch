import { detailPage } from "./utils/detail.js"
import { voyageSource } from "./utils/voyages.js"
import { alarmTiming, weatherSource } from "./utils/windows.js"

// An ocean fish's timer counts down to the voyages to its stop
detailPage(
  "fish",
  (data) => data.ocean ? voyageSource(data) : weatherSource(data),
  (data) => data.ocean ? { ocean: data.ocean } : alarmTiming(data)
)
