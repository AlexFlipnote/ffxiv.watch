import { detailPage } from "./utils/detail.js"
import { nextWindow } from "./utils/eorzea.js"

// A timer for each of the item's nodes that has times, the always up ones have none
detailPage("gathering", (node) => ({
  current: (now) => nextWindow(node, now),
  after: (from) => nextWindow(node, from)
}))
