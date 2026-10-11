// localStorage that tells the page when a value changes.
// The browser only tells the other tabs, so a change made here fires "stored" on the document for this one.

const fallback = new Map()

/**
 * @param {string} key
 * @returns {string | null}
 */
export function load(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return fallback.get(key) ?? null
  }
}

/**
 * @param {string} key
 * @param {string | null} value null removes it
 */
export function store(key, value) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    if (value === null) fallback.delete(key)
    else fallback.set(key, value)
  }
  document.dispatchEvent(new CustomEvent("stored", { detail: key }))
}

/**
 * Calls back when the key changes, in this tab or another.
 * @param {string} key
 * @param {() => void} callback
 */
export function onStored(key, callback) {
  // A null key is the other tab clearing everything
  addEventListener("storage", (e) => {
    if (e.key === key || e.key === null) callback()
  })
  document.addEventListener("stored", (e) => {
    if (e.detail === key) callback()
  })
}
