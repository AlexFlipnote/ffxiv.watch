/** Calls `fn(now)` right away, then every `interval` ms (aligned to the wall clock). */
export function tick(interval, fn) {
  const run = () => {
    fn(Date.now())
    // Rounded up so a fractional interval never fires just before its boundary
    setTimeout(run, Math.ceil(interval - (Date.now() % interval)))
  }
  run()
}
