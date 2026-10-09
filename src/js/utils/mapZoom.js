import { openMap } from "./mapModal.js"

// The maps on the detail pages open the map dialog with their spot, from the data-map the build put on them
for (const button of document.querySelectorAll(".map-zoom[data-map]")) {
  button.addEventListener("click", () => openMap(JSON.parse(button.dataset.map)))
}
