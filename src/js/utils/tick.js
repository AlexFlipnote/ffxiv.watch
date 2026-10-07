/** Calls `fn(now)` right away, then every `interval` ms (aligned to the wall clock). */
export function tick(interval, fn) {
  const run = () => {
    fn(Date.now())
    setTimeout(run, interval - (Date.now() % interval))
  }
  run()
}
