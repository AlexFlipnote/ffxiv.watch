/**
 * Closes a dialog with its × button, or a click on the backdrop where closedby="any" isn't supported yet.
 * @param {HTMLDialogElement} dialog
 * @param {HTMLButtonElement} closeButton
 */
export function closable(dialog, closeButton) {
  closeButton.addEventListener("click", () => dialog.close())
  dialog.addEventListener("click", (e) => {
    if (e.target !== dialog) return
    const rect = dialog.getBoundingClientRect()
    if (e.clientY < rect.top || e.clientY > rect.bottom || e.clientX < rect.left || e.clientX > rect.right) {
      dialog.close()
    }
  })
}
