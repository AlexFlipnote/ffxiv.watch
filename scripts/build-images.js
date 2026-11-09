import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

// Fills img/dist/ for the img.ffxiv.watch Worker: the icons and maps

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT = path.join(ROOT, "img/dist")
const FOLDERS = ["game", "maps"]

fs.rmSync(OUT, { recursive: true, force: true })
for (const folder of FOLDERS) {
  fs.cpSync(path.join(ROOT, "src/images", folder), path.join(OUT, folder), { recursive: true })
  console.log(`${folder}: ${fs.readdirSync(path.join(OUT, folder)).length} files`)
}
fs.copyFileSync(path.join(ROOT, "img/_headers"), path.join(OUT, "_headers"))
