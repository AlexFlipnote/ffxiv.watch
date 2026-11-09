import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { readSheet } from "./game.js"

// XIVAPI's ffxiv-datamining (https://github.com/xivapi/ffxiv-datamining): the names of the sheets' columns, which the
// game's files don't have. Run it to save those names after a patch that changes a sheet's columns: npm run game-columns

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

async function refreshColumns() {
  const columns = {}
  let differ = 0
  for (const name of sheetsUsed()) {
    const res = await fetch(`${HEADERS}/${name}.csv`)
    if (!res.ok) throw new Error(`${name}.csv: HTTP ${res.status}`)
    const [head] = (await res.text()).split("\n", 1)
    columns[name] = columnNames(head)
    const rows = readSheet(name)
    const width = rows[0]?.values.length
    if (width !== columns[name].length) {
      console.log(`${name}: ${columns[name].length} names for ${width} columns, the schema isn't caught up with the patch yet`)
      differ++
    } else {
      console.log(`${name}: ${columns[name].length} columns, ${rows.length} rows`)
    }
  }
  fs.writeFileSync(path.join(HERE, "game-columns.json"), JSON.stringify(columns) + "\n")
  console.log(`Wrote the columns of ${Object.keys(columns).length} sheets to scripts/sources/game-columns.json`)
  if (differ) process.exitCode = 1
}

if (import.meta.main) {
  refreshColumns().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
