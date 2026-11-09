import { alarmBell, placeOf, readAlarms } from "./alarmBells.js"
import { materials, preferredCrafter } from "./crafting.js"
import { closable } from "./dialog.js"
import { toast } from "./toast.js"
import { gameIcon } from "./images.js"
import { everyTick, formatIn, setText } from "./time.js"
import { alarmTiming, nextWeatherWindow } from "./windows.js"

// The craft tree, materials and crafts for a recipe page and a list, from data-planner (see plannerData in
// src/render/crafting.js): recipes are item id -> [recipe id, yield, job, level, ingredients, crystals]

const SOURCE_LABELS = { gathered: "Gathered", fished: "Fished", vendor: "Vendor", other: "Drop, market or other" }
// The crystals aren't one, they're folded away under the rest
const GROUPS = [
  ["Gather", ["gathered", "fished"]],
  ["Buy from vendors", ["vendor"]],
  ["Get elsewhere", ["other"]]
]
const STATE_ORDER = { open: 0, later: 1, always: 2, none: 3 }

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {(string | Node | false | null | undefined)[]} [children] Left out like html`` does when false or empty
 * @returns {HTMLElement}
 */
export function el(tag, className = "", children = []) {
  const node = document.createElement(tag)
  if (className) node.className = className
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== "" && c !== false))
  return node
}

/**
 * Several recipe pages' data as one, each root made by the preferred crafter when they can.
 * @param {object[]} list data-planner of each
 * @param {string | null} [crafter] See CRAFTER_KEY
 * @returns {{ recipes: object, items: object }}
 */
export function mergeData(list, crafter = null) {
  const recipes = Object.assign({}, ...list.map((d) => d.recipes))
  for (const d of list) {
    const job = preferredCrafter(crafter, d.crafters)
    recipes[d.root] = job ? d.crafters[job] : d.recipes[d.root]
  }
  return { recipes, items: Object.assign({}, ...list.map((d) => d.items)) }
}

/**
 * A button with an icon from /images/ui/, its label as a tooltip.
 * @param {string} icon "copy", "share", "delete"...
 * @param {string} label
 * @param {object} [options]
 * @param {boolean} [options.text] The label written out too
 * @param {string} [options.className]
 * @param {string} [options.tag] "a" for a link
 * @returns {HTMLElement}
 */
export function iconButton(icon, label, { text = false, className = "", tag = "button" } = {}) {
  const button = el(tag, `${text ? "text-button" : "icon-button"} ${className}`.trim(), [text && el("span", "", [label])])
  if (tag === "button") button.setAttribute("type", "button")
  button.title = label
  button.style.setProperty("--icon", `url("/images/ui/${icon}.svg")`)
  if (!text) button.setAttribute("aria-label", label)
  return button
}

/**
 * The button that opens the craft tree in a dialog, with copying it as text.
 * @param {() => HTMLElement | null} treeOf
 * @param {() => string} textOf
 * @param {string} [className]
 * @returns {HTMLElement}
 */
export function craftTreeButton(treeOf, textOf, className = "") {
  const button = iconButton("map", "Craft tree", { text: true, className })
  let dialog = null
  let body = null
  button.addEventListener("click", () => {
    const tree = treeOf()
    if (!tree) return
    if (!dialog) {
      const close = Object.assign(el("button", "close-btn", ["×"]), { type: "button" })
      close.setAttribute("aria-label", "Close")
      body = el("div", "planner-tree")
      const copy = iconButton("copy", "Copy as text", { text: true })
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(textOf())
          toast("Copied it as text", { tone: "success" })
        } catch {
          toast("Couldn't copy, your browser didn't allow it", { tone: "warning" })
        }
      })
      dialog = /** @type {HTMLDialogElement} */ (el("dialog", "modal planner-tree-modal", [
        el("div", "modal-header", [el("div", "planner-tree-title", [el("h2", "title", ["Craft tree"]), copy]), close]),
        body
      ]))
      dialog.setAttribute("closedby", "any")
      dialog.setAttribute("aria-label", "Craft tree")
      document.body.append(dialog)
      closable(dialog, close)
    }
    body.replaceChildren(tree)
    dialog.showModal()
  })
  return button
}

/**
 * An amount between + and -, up to 9999, counted as it's typed.
 * @param {number} value
 * @param {string} label
 * @param {(n: number) => void} onChange
 * @param {object} [options]
 * @param {boolean} [options.readOnly]
 * @param {number} [options.min]
 * @returns {{ el: HTMLElement, set: (n: number) => void }}
 */
export function stepper(value, label, onChange, { readOnly = false, min = 1 } = {}) {
  const clamp = (n) => Math.min(9999, Math.max(min, Math.floor(n) || min))
  const input = Object.assign(el("input", "input planner-input"), { type: "number", min, max: 9999, value, inputMode: "numeric", readOnly })
  input.setAttribute("aria-label", label)
  // See .planner-input
  const fit = () => input.style.setProperty("--digits", Math.max(1, input.value.length))
  fit()
  const set = (n) => {
    value = clamp(n)
    input.value = value
    fit()
    onChange(value)
  }
  input.addEventListener("input", () => {
    fit()
    // Half typed or emptied, it waits for more
    if (input.value === "" || !Number.isFinite(Number(input.value))) return
    const n = clamp(Number(input.value))
    if (n === value) return
    value = n
    onChange(value)
  })
  input.addEventListener("change", () => set(Number(input.value)))
  const step = (by, title) => {
    const button = Object.assign(el("button", "planner-step", [by > 0 ? "+" : "-"]), { type: "button", title })
    button.setAttribute("aria-label", title)
    button.addEventListener("click", () => set(value + by))
    return button
  }
  return {
    el: el("span", "planner-stepper", readOnly ? [input] : [step(1, "One more"), input, step(-1, "One fewer")]),
    set: (n) => {
      value = clamp(n)
      input.value = value
      fit()
    }
  }
}

/**
 * The tree, materials and crafts, drawn into the elements it returns.
 * @param {object} options
 * @param {{ recipes: object, items: object }} options.data
 * @param {() => [number, number][]} options.roots [item id, amount], read on every draw
 * @param {Set<number>} options.gotten Intermediates gotten rather than crafted
 * @param {Map<number, number>} [options.have] A list's counts of what's in hand
 * @param {Map<number, number>} [options.made] A list's counts of what's crafted
 * @param {() => void} [options.onChange]
 * @param {(done: { materials: boolean, crafts: boolean }) => void} [options.onComplete]
 * @returns {{ tree: HTMLElement, summary: HTMLElement, crafts: HTMLElement, draw: () => void, text: () => string }}
 */
export function planView({ data, roots, gotten, have = null, made = null, onChange = () => {}, onComplete = () => {} }) {
  // By their path from the root, "123>456"
  const folded = new Set()
  let unfolded = null
  let complete = ""
  // Counters marking rows while a draw builds them would report a half-built list as done or not
  let drawing = false
  let crystalsOpen = false
  const rootIds = () => new Set(roots().map(([id]) => id))

  const info = (id) => {
    const [name, icon, url, source, vendor, timing] = data.items[id]
    return { name, icon, url, source, vendor, timing }
  }

  /** @returns {import("./crafting.js").Recipe & { id: number, job: string, level: number } | null} */
  const recipeOf = (id) => {
    const r = data.recipes[id]
    if (!r || (gotten.has(id) && !rootIds().has(id))) return null
    return { id: r[0], item: id, yield: r[1], job: r[2], level: r[3], ingredients: r[4], crystals: r[5] }
  }

  const icon = (id) => Object.assign(el("img", "bait-icon"), { src: gameIcon(info(id).icon), alt: "", width: 24, height: 24, loading: "lazy" })
  const name = (id) => {
    const { name, url } = info(id)
    return url && url !== location.pathname ? Object.assign(el("a", "", [name]), { href: url }) : el("span", "", [name])
  }
  const chip = (text, className = "") => el("span", `chip ${className}`.trim(), [text])
  const amount = (n) => el("span", "crafting-amount", [`${n}x`])

  const tree = el("ul", "craft-tree")
  const summary = el("div", "planner-summary")
  const crafts = el("ol", "crafting-steps")

  /**
   * One item in the tree and what goes into it, for this branch alone.
   * @param {number} id
   * @param {number} need
   * @param {string} path
   * @param {boolean} root
   * @returns {HTMLLIElement}
   */
  function node(id, need, path, root) {
    const recipe = recipeOf(id)
    const times = recipe ? Math.ceil(need / recipe.yield) : 0
    const open = recipe && !folded.has(path)

    const fold = recipe && Object.assign(el("button", "craft-fold"), { type: "button" })
    if (fold) {
      fold.setAttribute("aria-expanded", open)
      fold.setAttribute("aria-label", `${open ? "Hide" : "Show"} what goes into ${info(id).name}`)
      fold.title = open ? "Hide what goes into it" : "Show what goes into it"
      fold.addEventListener("click", () => {
        if (folded.has(path)) {
          folded.delete(path)
          unfolded = path
        } else {
          folded.add(path)
        }
        draw()
      })
    }

    const toggle = data.recipes[id] && !root && Object.assign(el("button", "craft-toggle", [recipe ? "Craft" : "Get"]), { type: "button" })
    if (toggle) {
      toggle.setAttribute("aria-pressed", Boolean(recipe))
      toggle.title = recipe ? "Crafting it, tap to get it another way" : "Getting it another way, tap to craft it"
      toggle.addEventListener("click", () => {
        if (gotten.has(id)) gotten.delete(id)
        else gotten.add(id)
        onChange()
        draw()
      })
    }

    const { source, vendor } = info(id)
    const meta = recipe
      ? chip(`${recipe.job} Lv.${recipe.level}${times * recipe.yield > need ? `, makes ${times * recipe.yield}` : ""}`)
      : SOURCE_LABELS[source] && chip(source === "vendor" ? `Vendor ${vendor.toLocaleString("en-US")} gil` : SOURCE_LABELS[source], source === "vendor" ? "chip-gold" : "")

    const li = el("li", "", [
      el("div", "craft-node", [
        fold || el("span", "craft-fold-space"), icon(id), amount(need),
        el("span", "craft-label", [el("span", "crafting-ingredient", [name(id)]), meta, toggle])
      ])
    ])
    if (open) li.append(el("ul", path === unfolded ? "craft-unfold" : "", recipe.ingredients.map(([ingredient, per]) => node(ingredient, per * times, `${path}>${ingredient}`, false))))
    return li
  }

  /** Tells onComplete when the materials or the crafts become all done, or stop being */
  function allDone() {
    if (drawing) return
    const done = (part) => {
      const rows = part.querySelectorAll(".planner-has")
      return rows.length > 0 && [...rows].every((row) => row.classList.contains("planner-done"))
    }
    const now = { materials: done(summary), crafts: done(crafts) }
    if (JSON.stringify(now) === complete) return
    complete = JSON.stringify(now)
    onComplete(now)
  }

  let timers = []

  /**
   * @param {object[]} timing A timed node or a fish each
   * @param {number} now
   * @returns {import("./listing.js").Window & { timing?: object }} The soonest, up now first, and whose it is
   */
  function windowOf(timing, now) {
    if (!timing) return { always: true }
    const windows = timing.map((t) => {
      const w = nextWeatherWindow(t, now)
      return w && { ...w, timing: t }
    }).filter(Boolean)
    const open = windows.filter((w) => w.open).sort((a, b) => b.end - a.end)[0]
    return open ?? windows.sort((a, b) => a.start - b.start)[0] ?? null
  }
  const stateOf = (w) => !w ? "none" : w.always ? "always" : w.open ? "open" : "later"

  /**
   * A row's count of what's in hand or crafted, done once it's enough.
   * @param {HTMLLIElement} li
   * @param {Map<number, number> | null} counts
   * @param {number} id
   * @param {number} need
   * @param {string} label
   */
  function counter(li, counts, id, need, label) {
    if (!counts) return
    const mark = () => {
      li.classList.toggle("planner-done", (counts.get(id) ?? 0) >= need)
      allDone()
    }
    const count = stepper(counts.get(id) ?? 0, label, (n) => {
      if (n) counts.set(id, n)
      else counts.delete(id)
      mark()
      onChange()
    }, { min: 0 })
    li.classList.add("planner-has")
    li.append(el("span", "planner-have", [count.el]))
    mark()
  }

  /**
   * @param {number} id
   * @param {number} need
   * @param {import("./listing.js").Window} [w]
   * @returns {HTMLLIElement}
   */
  function materialRow(id, need, w) {
    const label = w && !w.always && (bellOf(id, w) ?? el("span", "chip planner-when", [el("span")]))
    const li = el("li", "", [icon(id), amount(need), el("span", "craft-label", [el("span", "crafting-ingredient", [name(id)]), label])])
    if (label) timers.push({ el: label.lastChild, li, w })
    counter(li, have, id, need, `How many ${info(id).name} you have`)
    return li
  }

  // Kept across draws, each one hooked up once
  const bells = new Map()
  let setAlarms = new Set()

  /**
   * The countdown as a button for the item's alarm: the node or fish already set, else the soonest. Like its page's
   * bell, so either shows it.
   * @param {number} id
   * @param {import("./listing.js").Window & { timing?: object }} w
   * @returns {HTMLButtonElement | null}
   */
  function bellOf(id, w) {
    const t = info(id).timing?.find((t) => setAlarms.has(t.alarm)) ?? w.timing
    if (!t?.alarm) return null
    if (!bells.has(id)) bells.set(id, Object.assign(el("button", "alarm-bell chip planner-when", [el("span")]), { type: "button" }))
    const { name, url, icon } = info(id)
    alarmBell(bells.get(id), { id: t.alarm, name, url, place: placeOf(t), icon, ...alarmTiming(t) })
    return bells.get(id)
  }

  /** @returns {{ groups: [string, [number, number][], number][], crystals: [number, number][], steps: object[] }} */
  function totals() {
    const { materials: needed, crystals, crafts: steps } = materials(roots(), recipeOf)
    const groups = GROUPS.map(([title, sources]) => {
      const list = [...needed].filter(([id]) => sources.includes(info(id).source))
      // A gathered item a vendor also sells isn't bought
      const gil = sources.includes("vendor") ? list.reduce((sum, [id, n]) => sum + info(id).vendor * n, 0) : 0
      return [title, list, gil]
    })
    return { groups, crystals: [...crystals], steps }
  }

  function draw() {
    const now = Date.now()
    drawing = true
    tree.replaceChildren(...roots().map(([id, n]) => node(id, n, String(id), true)))
    unfolded = null

    timers = []
    setAlarms = new Set(readAlarms().map((a) => a.id))
    const { groups, crystals, steps } = totals()
    const sections = groups.map(([title, list, gil]) => {
      if (!list.length) return null
      let rows
      if (title === "Gather") {
        const windows = new Map(list.map(([id]) => [id, windowOf(info(id).timing, now)]))
        const key = (w) => STATE_ORDER[stateOf(w)]
        const time = (w) => w?.open ? w.end : w?.start ?? 0
        rows = [...list].sort((a, b) => key(windows.get(a[0])) - key(windows.get(b[0])) || time(windows.get(a[0])) - time(windows.get(b[0])))
          .map(([id, n]) => materialRow(id, n, windows.get(id) ?? null))
      } else {
        rows = list.map(([id, n]) => materialRow(id, n))
      }
      return el("div", "planner-group", [
        el("h3", "crafting-heading", [title, gil > 0 && el("span", "planner-extra", [`${gil.toLocaleString("en-US")} gil`])]),
        el("ul", "crafting-ingredients", rows)
      ])
    })

    const crystalList = crystals.length > 0 && Object.assign(el("details", "planner-crystals", [
      el("summary", "", ["Crystals needed"]),
      el("ul", "crafting-ingredients", crystals.map(([id, n]) => el("li", "", [icon(id), amount(n), el("span", "crafting-ingredient", [info(id).name])])))
    ]), { open: crystalsOpen })
    if (crystalList) {
      crystalList.addEventListener("toggle", () => {
        crystalsOpen = crystalList.open
      })
    }
    summary.replaceChildren(...[...sections, crystalList].filter(Boolean))

    crafts.replaceChildren(...steps.map((c) => {
      const li = el("li", "", [
        icon(c.recipe.item), amount(c.crafts),
        el("span", "craft-label", [el("span", "crafting-ingredient", [name(c.recipe.item)]), chip(`${c.recipe.job} Lv.${c.recipe.level}`)])
      ])
      counter(li, made, c.recipe.item, c.crafts, `How many times you've crafted ${info(c.recipe.item).name}`)
      return li
    }))
    drawing = false
    allDone()
    tick(now)
  }

  /**
   * The countdowns, a window opening or closing redraws.
   * @param {number} now
   */
  function tick(now) {
    for (const t of timers) {
      if (t.w && !t.w.always && now >= (t.w.open ? t.w.end : t.w.start)) return draw()
      const state = stateOf(t.w)
      t.li.classList.toggle("planner-up", state === "open")
      setText(t.el, state === "open" ? `Up, ${formatIn(t.w.end - now)} left`
        : state === "later" ? `Up in ${formatIn(t.w.start - now)}` : "Not in the next 30 days")
    }
  }

  /**
   * @param {number} id
   * @param {number} need
   * @param {number} depth
   * @param {string[]} out
   */
  function treeLines(id, need, depth, out) {
    const recipe = recipeOf(id)
    const times = recipe ? Math.ceil(need / recipe.yield) : 0
    out.push(`${"  ".repeat(depth)}${need}x ${info(id).name}${recipe ? ` (${recipe.job} Lv.${recipe.level})` : ""}`)
    for (const [ingredient, per] of recipe?.ingredients ?? []) treeLines(ingredient, per * times, depth + 1, out)
  }

  /** @returns {string} The tree, then what's left to get and craft */
  function text() {
    const { groups, crystals, steps } = totals()
    const lines = ["Craft tree"]
    for (const [id, n] of roots()) treeLines(id, n, 1, lines)
    lines.push("")
    const left = (list, counts) => list.map(([id, n]) => [id, n - (counts?.get(id) ?? 0)]).filter(([, n]) => n > 0)
    for (const [title, list, gil] of groups) {
      const rows = left(list, have)
      if (!rows.length) continue
      lines.push(gil ? `${title} (${gil.toLocaleString("en-US")} gil)` : title, ...rows.map(([id, n]) => `  ${n}x ${info(id).name}`), "")
    }
    if (crystals.length) lines.push("Crystals", ...crystals.map(([id, n]) => `  ${n}x ${info(id).name}`), "")
    const todo = steps.map((c) => [c, c.crafts - (made?.get(c.recipe.item) ?? 0)]).filter(([, n]) => n > 0)
    if (todo.length) lines.push("Crafts, in order", ...todo.map(([c, n]) => `  ${n}x ${info(c.recipe.item).name} (${c.recipe.job} Lv.${c.recipe.level})`))
    return lines.join("\n").trim()
  }

  // A replaced plan stops; by the summary, as the tree can be in a closed dialog
  everyTick((now) => {
    if (summary.isConnected) tick(now)
  })
  return { tree, summary, crafts, draw, text }
}
