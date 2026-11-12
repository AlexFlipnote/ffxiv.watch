// Teamcraft (MIT, (c) 2017 Flavien Normand): https://github.com/ffxiv-teamcraft/ffxiv-teamcraft
// Only for what isn't in the game's files, the server sends it:
// - fishing-sources.json: the bait, hookset and tug of the fish that bite any time, and of the ocean fish

const FILES = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json"

/**
 * @param {string} file "nodes.json"
 * @returns {Promise<any>}
 */
export async function teamcraft(file) {
  const res = await fetch(`${FILES}/${file}`)
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
  return res.json()
}
