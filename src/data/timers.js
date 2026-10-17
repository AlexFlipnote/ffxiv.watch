import { formatCountdown, formatDate } from "../js/utils/time.js"
import { getAllTimerStates, TIMERS } from "../js/utils/timers.js"

export const sources = ["js/utils/timers.js"]

/**
 * The timer cards as of the build, so search engines can read them without running JS. index.js finds them by data-id
 * and fills in the countdowns, the build's hold their room until then. The hidden details are the modal's text, for
 * search engines only.
 */
export default () => {
  const now = Date.now()
  const states = getAllTimerStates(now)
  return TIMERS.map((timer, i) => ({
    id: timer.id,
    class: timer.small ? "timer small" : "timer",
    name: timer.name,
    page: timer.page ?? false,
    regions: timer.regions?.map((region) => region.name) ?? false,
    countdown: formatCountdown(states[i].target - now),
    targetLabel: states[i].targetLabel,
    target: formatDate(new Date(states[i].target), new Date(now)),
    note: states[i].note ?? "",
    noNote: !states[i].note,
    when: timer.when ?? false,
    details: timer.phases?.map((phase) => `${phase.name}: ${phase.info}`)
      ?? timer.regions?.map((region) => `${region.name}: ${region.when} ${region.info}`)
      ?? [timer.info ?? ""],
    list: timer.list ?? false,
    link: timer.link ?? false
  }))
}
