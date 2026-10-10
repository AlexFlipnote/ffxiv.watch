import { openMap } from "./mapModal.js"

// The maps on the detail pages open the map dialog with their spot, from the data-map the build put on them
for (const link of document.querySelectorAll(".map-zoom[data-map]")) {
  link.addEventListener("click", (e) => {
    e.preventDefault()
    openMap(JSON.parse(link.dataset.map))
  })
}
