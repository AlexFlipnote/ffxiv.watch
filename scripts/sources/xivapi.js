import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { columnCount } from "./game.js"

// XIVAPI's ffxiv-datamining (https://github.com/xivapi/ffxiv-datamining): the names of the sheets' columns, which the
// game's files don't have. npm run game-data runs this first, it only goes online for a sheet that changed

const HERE = path.dirname(fileURLToPath(import.meta.url))

// The CSVs' first line names the columns, in the order the sheet has them
const HEADERS = "https://raw.githubusercontent.com/xivapi/ffxiv-datamining/master/csv/en"

/** @returns {string[]} The data scripts, which name the sheets they read */
const scriptFiles = () => [path.join(HERE, ".."), path.join(HERE, "../build"), HERE]
  .flatMap((dir) => fs.readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => path.join(dir, f)))

/** @returns {string[]} Every sheet name in a sheet("...") or sheets([...]) of the scripts */
function sheetsUsed() {
  const names = new Set()
  for (const file of scriptFiles()) {
    const source = fs.readFileSync(file, "utf8")
    for (const call of source.matchAll(/sheets?\(\s*\[?([^)\]]*)/g)) {
      for (const name of call[1].matchAll(/"([A-Z][A-Za-z0-9]*)"/g)) names.add(name[1])
    }
  }
  return [...names].sort()
}

/**
 * @param {string} line A CSV header, its names have no commas or quotes
 * @returns {string[]} After the "#" of the row id
 */
const columnNames = (line) => line.replace(/\r$/, "").split(",").slice(1)

/**
 * Keeps game-columns.json in step with the install. A sheet keeps its saved names while it has as many columns as they
 * name, only one the scripts start reading or a patch reshapes has its names fetched, so most runs stay offline.
 * Throws when the schema hasn't caught up with a patch yet, before any data is written with names that don't fit.
 */
async function updateColumns() {
  const file = path.join(HERE, "game-columns.json")
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {}
  const columns = {}
  const behind = []
  for (const name of sheetsUsed()) {
    const width = columnCount(name)
    if (saved[name]?.length === width) {
      columns[name] = saved[name]
      continue
    }
    const res = await fetch(`${HEADERS}/${name}.csv`)
    if (!res.ok) throw new Error(`${name}.csv: HTTP ${res.status}`)
    const names = columnNames((await res.text()).split("\n", 1)[0])
    if (names.length !== width) {
      behind.push(`${name} (${names.length} names for ${width} columns)`)
      continue
    }
    // The scripts read columns by name, a renamed one would read as empty
    const before = saved[name] ?? []
    const gone = before.filter((n) => !names.includes(n))
    const added = names.filter((n) => !before.includes(n))
    console.log(`Columns: ${name} ${before.length ? `went from ${before.length} to ${width}` : `is new, ${width}`}${gone.length ? `, without ${gone.join(", ")}` : ""}${added.length && before.length ? `, with ${added.join(", ")}` : ""}`)
    columns[name] = names
  }
  if (behind.length) throw new Error(`The column names aren't caught up with the patch yet: ${behind.join(", ")}`)

  if (JSON.stringify(columns) !== JSON.stringify(saved)) {
    fs.writeFileSync(file, JSON.stringify(columns) + "\n")
    console.log(`Columns: saved the names of ${Object.keys(columns).length} sheets`)
  } else {
    console.log(`Columns: all ${Object.keys(columns).length} sheets as the install has them`)
  }
}

if (import.meta.main) {
  updateColumns().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
