/**
 * Closes a dialog with its × button, or a click on the backdrop where closedby="any" isn't supported yet. Also makes
 * it fill the screen while its content doesn't fit, see fitScreen.
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
  fitScreen(dialog)
}

/**
 * Adds .modal-full while the dialog would scroll as a card, which on a phone makes it the whole screen (_modal.scss).
 * Measured as a card every time, so taking the screen's width can't make it fit and flip back. Its content resizing
 * covers it opening and changing, the window resizing covers turning the phone.
 * @param {HTMLDialogElement} dialog
 */
function fitScreen(dialog) {
  const fit = () => {
    if (!dialog.open) return
    dialog.classList.remove("modal-full")
    dialog.classList.toggle("modal-full", dialog.scrollHeight > dialog.clientHeight)
  }
  const observer = new ResizeObserver(fit)
  for (const child of dialog.children) observer.observe(child)
  window.addEventListener("resize", fit)
}
