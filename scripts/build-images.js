import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import saucer from "../src/data/saucer.js"
import weather from "../src/data/weather.js"
import { writeOgImages } from "../src/render/og.js"

// Fills img/dist/ for the img.ffxiv.watch Worker: icons, maps and the zones' link previews

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT = path.join(ROOT, "img/dist")
const FOLDERS = ["game", "maps"]

fs.rmSync(OUT, { recursive: true, force: true })
for (const folder of FOLDERS) {
  fs.cpSync(path.join(ROOT, "src/images", folder), path.join(OUT, folder), { recursive: true })
  console.log(`${folder}: ${fs.readdirSync(path.join(OUT, folder)).length} files`)
}
fs.copyFileSync(path.join(ROOT, "img/_headers"), path.join(OUT, "_headers"))

// Reading the zones queues their previews
for (const pages of [weather, saucer]) pages()
console.log(`og: ${await writeOgImages(path.join(OUT, "og"))} files`)
