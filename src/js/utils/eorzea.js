// Eorzea time runs 3600/175 (~20.57x) faster than Earth time: one Eorzean hour is 175 Earth seconds.
// The Eorzean calendar has 12 moons of 32 suns, alternating Astral (odd) and Umbral (even).

const EORZEA_MULTIPLIER = 3600 / 175

// One Eorzean minute in Earth ms (~2917). Unix time 0 is also an ET minute boundary.
export const ET_MINUTE_EARTH_MS = 175000 / 60

const ET_MINUTE = 60 * 1000
const ET_HOUR = 60 * ET_MINUTE
const ET_SUN = 24 * ET_HOUR
const ET_MOON = 32 * ET_SUN

export function toEorzea(earthMs) {
  const et = earthMs * EORZEA_MULTIPLIER
  const moon = (Math.floor(et / ET_MOON) % 12) + 1

  return {
    hours: Math.floor(et / ET_HOUR) % 24,
    minutes: Math.floor(et / ET_MINUTE) % 60,
    sun: (Math.floor(et / ET_SUN) % 32) + 1,
    moon,
    moonName: `${ordinal(Math.ceil(moon / 2))} ${moon % 2 ? "Astral" : "Umbral"} Moon`
  }
}

export function ordinal(n) {
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 100 >= 11 && n % 100 <= 13 ? 0 : n % 10] ?? "th"
  return `${n}${suffix}`
}
