import { toast } from "./toast.js"

const KEY = "clockOffset"
const MIN_OFFSET_MS = 2000
const MAX_ROUND_TRIP_MS = 2000

let offset = 0
try {
  offset = Number(sessionStorage.getItem(KEY)) || 0
} catch {
  // Storage blocked
}

/**
 * Use this instead of `Date.now()`.
 * @returns {number} The real time, the device clock corrected by the server's
 */
export const clockNow = () => Date.now() + offset

/**
 * "3 minutes", "1 hour", rounded to the biggest unit that fits.
 * @param {number} ms
 * @returns {string}
 */
function formatGap(ms) {
  const units = [["day", 86400000], ["hour", 3600000], ["minute", 60000], ["second", 1000]]
  const [unit, size] = units.find(([, size]) => ms >= size)
  const n = Math.round(ms / size)
  return `${n} ${unit}${n > 1 ? "s" : ""}`
}

/**
 * Compares the device clock to the server's Date header, and keeps the gap for the visit when it's big enough. Says so
 * when the gap changes, not on every page.
 */
async function check() {
  const sent = Date.now()
  const res = await fetch("/", { method: "HEAD", cache: "no-store", headers: { "X-Double-Clock": "I do not trust you, yet..." } })
  const received = Date.now()
  const date = Date.parse(res.headers.get("Date"))
  if (!date || received - sent > MAX_ROUND_TRIP_MS) return

  // The header is cut to the second, and was made somewhere between sent and received
  const measured = date + 500 - (sent + received) / 2
  const error = 500 + (received - sent) / 2
  if (Math.abs(measured - offset) <= error) return

  offset = Math.abs(measured) > MIN_OFFSET_MS ? Math.round(measured) : 0
  try {
    sessionStorage.setItem(KEY, offset)
  } catch {
    // Storage blocked
  }
  if (offset) {
    toast(`Your device's clock is ${formatGap(Math.abs(offset))} ${offset > 0 ? "slow" : "fast"}, the times here are corrected for it.`, { duration: 8000, tone: "warning" })
  }
}

check().catch(() => {})
