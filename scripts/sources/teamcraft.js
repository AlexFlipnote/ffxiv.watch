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

// Which NPC opens each shop the game only links to it in its scripts: the Shadowbringers gemstone traders', picked by
// FATE rank, and the Doman Enclave junkmonger's. Copied from Teamcraft's shops.json once, as content this old doesn't
// change
export const SCRIPT_SHOPS = {
  262919: [1025763],
  1769957: [1027998],
  1769958: [1027538],
  1769959: [1027385],
  1769960: [1027497],
  1769961: [1027892],
  1769962: [1027665],
  1769963: [1027709],
  1769964: [1027766]
}
