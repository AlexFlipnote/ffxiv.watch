// The link back to the list. Coming from the list, it goes back in history instead, which brings the list back
// as it was left: the filters, the search and how far down it was scrolled
const backlink = document.querySelector(".backlink")

backlink?.addEventListener("click", (e) => {
  let from = null
  try {
    from = new URL(document.referrer)
  } catch {
    return
  }

  if (from.origin === location.origin && from.pathname === backlink.pathname && history.length > 1) {
    e.preventDefault()
    history.back()
  }
})
