import fs from "fs"
import path from "path"
import sharp from "sharp"
import { fileURLToPath } from "url"
import zlib from "zlib"

// OURS: the game's own files, read from the install. Its archives (SqPack, in game/sqpack) hold every file by a hash of
// its path: a category's .index says which .dat it's in and where, in blocks that are each deflated. The sheets (Excel,
// as the game calls them) are files in it: an .exh with the columns and pages of rows, an .exd per page and language.

// Where the game is installed is each machine's own, kept in .env, see .env.example
try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.env"))
} catch {
  // No .env, FFXIV_GAME can still be set another way
}
export const GAME = process.env.FFXIV_GAME

// The first folder of a path, as the archive it's in
const CATEGORIES = {
  common: 0x00, bgcommon: 0x01, bg: 0x02, cut: 0x03, chara: 0x04, shader: 0x05, ui: 0x06, sound: 0x07, vfx: 0x08,
  ui_script: 0x09, exd: 0x0a, game_script: 0x0b, music: 0x0c
}
// How a file is stored: a plain one is its blocks in a row, a texture its header then each mipmap's blocks
const PLAIN = 2
const TEXTURE = 4
// A block's compressed size when it's stored as it is
const UNCOMPRESSED = 32000
const BLOCK_HEADER = 16

/**
 * The game's path hash: CRC-32 without the final XOR, of the lowercase text.
 * @param {string} text
 * @returns {number}
 */
const hash = (text) => (~zlib.crc32(text.toLowerCase())) >>> 0

/**
 * @param {string} file "exd/item.exh"
 * @returns {{ dir: string, prefix: string }} Where its archive is, and the start of the archive's file names
 */
function archiveOf(file) {
  if (!GAME) throw new Error("Set FFXIV_GAME in .env to the game's folder, see .env.example")
  const [top, second] = file.split("/")
  const category = CATEGORIES[top]
  if (category === undefined) throw new Error(`${file}: not a known category`)
  // bg/ex1/... and music/ex2/... are in that expansion's folder
  const repo = /^ex\d+$/.test(second) ? second : "ffxiv"
  const expansion = repo === "ffxiv" ? 0 : +repo.slice(2)
  return { dir: path.join(GAME, "sqpack", repo), prefix: `${category.toString(16).padStart(2, "0")}${expansion.toString(16).padStart(2, "0")}` }
}

// Index file -> its entries, hash -> [dat number, offset]
const indexes = new Map()

/**
 * @param {string} file The .index file's path
 * @returns {Map<bigint, [number, number]>}
 */
function readIndex(file) {
  if (indexes.has(file)) return indexes.get(file)
  const buffer = fs.readFileSync(file)
  const header = buffer.readUInt32LE(0x0c)
  const offset = buffer.readUInt32LE(header + 0x08)
  const size = buffer.readUInt32LE(header + 0x0c)
  const entries = new Map()
  for (let at = offset; at < offset + size; at += 16) {
    const data = buffer.readUInt32LE(at + 8)
    entries.set(buffer.readBigUInt64LE(at), [(data & 0b1110) >> 1, (data & ~0xf) * 8])
  }
  indexes.set(file, entries)
  return entries
}

// Open .dat files, kept open as one export reads thousands of files from them
const dats = new Map()

/**
 * @param {string} file
 * @returns {number} The file descriptor
 */
function datFile(file) {
  if (!dats.has(file)) dats.set(file, fs.openSync(file, "r"))
  return dats.get(file)
}

/**
 * @param {number} fd
 * @param {number} offset
 * @param {number} length
 * @returns {Buffer}
 */
function readAt(fd, offset, length) {
  const buffer = Buffer.alloc(length)
  fs.readSync(fd, buffer, 0, length, offset)
  return buffer
}

/**
 * One block of a file, its own header first.
 * @param {number} fd
 * @param {number} offset
 * @returns {Buffer}
 */
function readBlock(fd, offset) {
  const header = readAt(fd, offset, BLOCK_HEADER)
  const compressed = header.readUInt32LE(8)
  const size = header.readUInt32LE(12)
  if (compressed === UNCOMPRESSED) return readAt(fd, offset + BLOCK_HEADER, size)
  return zlib.inflateRawSync(readAt(fd, offset + BLOCK_HEADER, compressed))
}

/**
 * A texture's .tex file. After the archive's header, a group per mipmap (where its blocks start and how many), then
 * every block's size. The .tex file's own header is stored as it is, before the first group's blocks.
 * @param {number} fd
 * @param {number} offset Where the file starts in the .dat
 * @param {number} headerSize
 * @param {number} groups
 * @returns {Buffer}
 */
function textureFile(fd, offset, headerSize, groups) {
  const table = readAt(fd, offset + 24, groups * 20)
  const counts = Array.from({ length: groups }, (_, i) => table.readUInt32LE(i * 20 + 16))
  const sizes = readAt(fd, offset + 24 + groups * 20, counts.reduce((a, b) => a + b, 0) * 2)
  const parts = [readAt(fd, offset + headerSize, table.readUInt32LE(0))]
  let block = 0
  for (let i = 0; i < groups; i++) {
    let at = offset + headerSize + table.readUInt32LE(i * 20)
    for (let j = 0; j < counts[i]; j++, block++) {
      parts.push(readBlock(fd, at))
      at += sizes.readUInt16LE(block * 2)
    }
  }
  return Buffer.concat(parts)
}

/**
 * A plain file, the kind the sheets and level files are, or a texture. Models are stored another way.
 * @param {string} file "exd/root.exl"
 * @returns {Buffer | null} Null when there's no such file
 */
export function readFile(file) {
  file = file.toLowerCase()
  const { dir, prefix } = archiveOf(file)
  const slash = file.lastIndexOf("/")
  const key = (BigInt(hash(file.slice(0, slash))) << 32n) | BigInt(hash(file.slice(slash + 1)))

  // A big archive is split in chunks, 0a0000, 0a0100...
  const chunks = fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith(".win32.index")).sort()
  for (const chunk of chunks) {
    const found = readIndex(path.join(dir, chunk)).get(key)
    if (!found) continue
    const [dat, offset] = found
    const fd = datFile(path.join(dir, chunk.replace(".index", `.dat${dat}`)))

    const info = readAt(fd, offset, 24)
    const headerSize = info.readUInt32LE(0)
    const type = info.readUInt32LE(4)
    const size = info.readUInt32LE(8)
    const blockCount = info.readUInt32LE(20)
    if (type === TEXTURE) return textureFile(fd, offset, headerSize, blockCount)
    if (type !== PLAIN) throw new Error(`${file}: type ${type}, only plain files and textures are read`)

    // Each block: its offset from the end of the header, then its sizes
    const table = readAt(fd, offset + 24, blockCount * 8)
    const blocks = []
    for (let i = 0; i < blockCount; i++) blocks.push(readBlock(fd, offset + headerSize + table.readUInt32LE(i * 8)))
    return Buffer.concat(blocks).subarray(0, size)
  }
  return null
}

// Textures. A .tex file is an 80-byte header (format, size, where each mipmap starts), then the mipmaps

// The pixel formats of the ones read, the icons use these
const B5G5R5A1 = 0x1441
const B8G8R8A8 = 0x1450
const BC1 = 0x3420
const BC7 = 0x6432
const RGB565_MAX = [31, 63, 31]

/**
 * BC1: a 4x4 block is two RGB565 colors and 2 bits a pixel picking one of them or a blend. With the first color the
 * lower, the fourth pick is transparent. Blended before the 5 and 6 bits are made 8, as DirectX does
 * @param {Buffer} b
 * @param {number} at
 * @returns {number[][]} 16 RGBA pixels, row by row
 */
function bc1Block(b, at) {
  const c0 = b.readUInt16LE(at)
  const c1 = b.readUInt16LE(at + 2)
  const [e0, e1] = [c0, c1].map((c) => [c >> 11, (c >> 5) & 63, c & 31])
  const blend = (p, q) => [...e0.map((v, ch) => Math.round((p * v + q * e1[ch]) / (p + q) / RGB565_MAX[ch] * 255)), 255]
  const colors = c0 > c1
    ? [blend(1, 0), blend(0, 1), blend(2, 1), blend(1, 2)]
    : [blend(1, 0), blend(0, 1), blend(1, 1), [0, 0, 0, 0]]
  const bits = b.readUInt32LE(at + 4)
  return Array.from({ length: 16 }, (_, i) => colors[(bits >>> (i * 2)) & 3])
}

// BC7's modes: subsets, partition bits, rotation bits, index selection bits, color bits, alpha bits, a p-bit per
// endpoint, a p-bit per subset, index bits, second index bits
const BC7_MODES = [
  [3, 4, 0, 0, 4, 0, 1, 0, 3, 0], [2, 6, 0, 0, 6, 0, 0, 1, 3, 0], [3, 6, 0, 0, 5, 0, 0, 0, 2, 0], [2, 6, 0, 0, 7, 0, 1, 0, 2, 0],
  [1, 0, 2, 1, 5, 6, 0, 0, 2, 3], [1, 0, 2, 0, 7, 8, 0, 0, 2, 2], [1, 0, 0, 0, 7, 7, 1, 0, 4, 0], [2, 6, 0, 0, 5, 5, 1, 0, 2, 0]
]
// Which pixels are the second subset, per two-subset partition, a bit a pixel
const BC7_PARTITIONS = [
  0xcccc, 0x8888, 0xeeee, 0xecc8, 0xc880, 0xfeec, 0xfec8, 0xec80, 0xc800, 0xffec, 0xfe80, 0xe800, 0xffe8, 0xff00, 0xfff0, 0xf000,
  0xf710, 0x008e, 0x7100, 0x08ce, 0x008c, 0x7310, 0x3100, 0x8cce, 0x088c, 0x3110, 0x6666, 0x366c, 0x17e8, 0x0ff0, 0x718e, 0x399c,
  0xaaaa, 0xf0f0, 0x5a5a, 0x33cc, 0x3c3c, 0x55aa, 0x9696, 0xa55a, 0x73ce, 0x13c8, 0x324c, 0x3bdc, 0x6996, 0xc33c, 0x9966, 0x0660,
  0x0272, 0x04e4, 0x4e40, 0x2720, 0xc936, 0x936c, 0x39c6, 0x639c, 0x9336, 0x9cc6, 0x817e, 0xe718, 0xccf0, 0x0fcc, 0x7744, 0xee22
]
// The second subset's anchor pixel, whose index is a bit shorter, per two-subset partition
const BC7_ANCHORS = [
  15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 2, 8, 2, 2, 8, 8, 15, 2, 8, 2, 2, 8, 8, 2, 2,
  15, 15, 6, 8, 2, 8, 15, 15, 2, 8, 2, 2, 2, 15, 15, 6, 6, 2, 6, 8, 15, 15, 2, 2, 15, 15, 15, 15, 15, 2, 2, 15
]
const BC7_WEIGHTS = {
  2: [0, 21, 43, 64],
  3: [0, 9, 18, 27, 37, 46, 55, 64],
  4: [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64]
}

/**
 * BC7: a 4x4 block in one of eight modes, the lowest set bit saying which. Each has its own number of subsets (groups
 * of pixels with their own two endpoint colors), bits per endpoint and bits per index into the blend between them.
 * @param {Buffer} b
 * @param {number} at
 * @returns {number[][]} 16 RGBA pixels, row by row
 */
function bc7Block(b, at) {
  let bit = 0
  const read = (n) => {
    let v = 0
    for (let i = 0; i < n; i++, bit++) v |= ((b[at + (bit >> 3)] >> (bit & 7)) & 1) << i
    return v
  }
  let mode = 0
  while (mode < 8 && !read(1)) mode++
  if (mode === 8) return Array.from({ length: 16 }, () => [0, 0, 0, 0])
  const [subsets, partitionBits, rotationBits, selectionBits, colorBits, alphaBits, endpointP, sharedP, indexBits, index2Bits] = BC7_MODES[mode]
  if (subsets === 3) throw new Error(`BC7 mode ${mode} has three subsets, which isn't read yet`)
  const partition = read(partitionBits)
  const rotation = read(rotationBits)
  const selection = read(selectionBits)

  // Every endpoint's red, then green, then blue, then alpha
  const ends = Array.from({ length: subsets * 2 }, () => [0, 0, 0, 255])
  const bitsOf = [colorBits, colorBits, colorBits, alphaBits]
  const channels = alphaBits ? 4 : 3
  for (let c = 0; c < channels; c++) for (const e of ends) e[c] = read(bitsOf[c])
  const shared = sharedP ? Array.from({ length: subsets }, () => read(1)) : null
  const pbits = endpointP ? ends.map(() => read(1)) : shared?.flatMap((p) => [p, p])
  for (const [i, e] of ends.entries()) {
    for (let c = 0; c < channels; c++) {
      let v = e[c]
      let n = bitsOf[c]
      if (pbits) {
        v = (v << 1) | pbits[i]
        n++
      }
      v <<= 8 - n
      e[c] = v | (v >> n)
    }
  }

  const subsetOf = (px) => subsets === 2 && (BC7_PARTITIONS[partition] >> px) & 1 ? 1 : 0
  const anchor = (px) => px === 0 || (subsets === 2 && px === BC7_ANCHORS[partition])
  const indices = Array.from({ length: 16 }, (_, px) => read(anchor(px) ? indexBits - 1 : indexBits))
  const indices2 = index2Bits ? Array.from({ length: 16 }, (_, px) => read(px === 0 ? index2Bits - 1 : index2Bits)) : null

  return indices.map((index, px) => {
    const s = subsetOf(px)
    const [e0, e1] = [ends[s * 2], ends[s * 2 + 1]]
    // With two index sets, one is the color's and one the alpha's, the selection bit swaps them
    const [colorIndex, colorN, alphaIndex, alphaN] = indices2
      ? selection ? [indices2[px], index2Bits, index, indexBits] : [index, indexBits, indices2[px], index2Bits]
      : [index, indexBits, index, indexBits]
    const blend = (c, i, n) => {
      const w = BC7_WEIGHTS[n][i]
      return ((64 - w) * e0[c] + w * e1[c] + 32) >> 6
    }
    const pixel = [blend(0, colorIndex, colorN), blend(1, colorIndex, colorN), blend(2, colorIndex, colorN), blend(3, alphaIndex, alphaN)]
    // A rotation stored a color channel in alpha's place, for its finer index
    if (rotation) [pixel[rotation - 1], pixel[3]] = [pixel[3], pixel[rotation - 1]]
    return pixel
  })
}

/**
 * A texture's largest mipmap.
 * @param {string} file "ui/icon/022000/022408_hr1.tex"
 * @returns {{ width: number, height: number, rgba: Buffer } | null} Null when there's no such file
 */
export function readTexture(file) {
  const b = readFile(file)
  if (!b) return null
  const format = b.readUInt32LE(4)
  const width = b.readUInt16LE(8)
  const height = b.readUInt16LE(10)
  const start = b.readUInt32LE(28)
  const rgba = Buffer.alloc(width * height * 4)

  if (format === BC1 || format === BC7) {
    const [size, decode] = format === BC1 ? [8, bc1Block] : [16, bc7Block]
    const across = Math.ceil(width / 4)
    for (let by = 0; by < Math.ceil(height / 4); by++) {
      for (let bx = 0; bx < across; bx++) {
        decode(b, start + (by * across + bx) * size).forEach((pixel, i) => {
          const x = bx * 4 + (i % 4)
          const y = by * 4 + (i >> 2)
          if (x < width && y < height) rgba.set(pixel, (y * width + x) * 4)
        })
      }
    }
  } else if (format === B8G8R8A8) {
    for (let i = 0; i < width * height; i++) {
      const at = start + i * 4
      rgba.set([b[at + 2], b[at + 1], b[at], b[at + 3]], i * 4)
    }
  } else if (format === B5G5R5A1) {
    const five = (v) => Math.round((v & 31) * 255 / 31)
    for (let i = 0; i < width * height; i++) {
      const v = b.readUInt16LE(start + i * 2)
      rgba.set([five(v >> 10), five(v >> 5), five(v), v >> 15 ? 255 : 0], i * 4)
    }
  } else {
    throw new Error(`${file}: texture format 0x${format.toString(16)} isn't read yet`)
  }
  return { width, height, rgba }
}

// Layouts. A zone's .lgb files place everything in it: a chunk of layers, each a list of objects with their type and
// where they stand. Offsets are from the table they're in

const LAYOUT_FILES = ["planevent", "planlive", "planmap", "planner", "bg", "sound", "vfx"]
const LAYER_CHUNK = 20
const EVENT_NPC = 8

/**
 * The event NPCs a zone's layout places, its own and not a seasonal event's.
 * @param {string} bg TerritoryType.Bg, like "ffxiv/sea_s1/fld/s1f1/level/s1f1"
 * @returns {{ npc: string, x: number, y: number, z: number }[]} The ENpcBase row and its world position
 */
export function layoutNpcs(bg) {
  const level = bg.indexOf("/level/")
  if (level < 0) return []
  const npcs = []
  for (const name of LAYOUT_FILES) {
    const b = readFile(`bg/${bg.slice(0, level)}/level/${name}.lgb`)
    // An empty one has no chunk of layers
    if (!b || b.toString("latin1", LAYER_CHUNK - 8, LAYER_CHUNK - 4) !== "LGP1") continue
    const layers = LAYER_CHUNK + b.readInt32LE(LAYER_CHUNK + 8)
    for (let i = 0; i < b.readInt32LE(LAYER_CHUNK + 12); i++) {
      const layer = layers + b.readInt32LE(layers + i * 4)
      // A festival's layer only shows during that event
      if (b.readUInt16LE(layer + 24)) continue
      const objects = layer + b.readInt32LE(layer + 8)
      for (let j = 0; j < b.readInt32LE(layer + 12); j++) {
        const at = objects + b.readInt32LE(objects + j * 4)
        if (b.readInt32LE(at) !== EVENT_NPC) continue
        npcs.push({ npc: String(b.readUInt32LE(at + 48)), x: b.readFloatLE(at + 12), y: b.readFloatLE(at + 16), z: b.readFloatLE(at + 20) })
      }
    }
  }
  return npcs
}

const ICONS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/images/game")

/**
 * Saves the game's icons (items, actions, emotes) to src/images/game/<id>.webp, so the site serves its own copies. The
 * game's 80px, compressed hard, as the lists show hundreds of them. Icons already there are kept.
 * @param {number[]} ids Icon values from the sheets, like Item.Icon, repeats are fine
 */
export async function saveIcons(ids) {
  fs.mkdirSync(ICONS, { recursive: true })
  const queue = [...new Set(ids)].filter((id) => !fs.existsSync(path.join(ICONS, `${id}.webp`)))
  for (const id of queue) {
    // ui/icon/022000/022408_hr1.tex, a folder per thousand
    const folder = String(Math.floor(id / 1000) * 1000).padStart(6, "0")
    const texture = readTexture(`ui/icon/${folder}/${String(id).padStart(6, "0")}_hr1.tex`)
    if (!texture) throw new Error(`No icon ${id} in the game's files`)
    const { width, height, rgba } = texture
    await sharp(rgba, { raw: { width, height, channels: 4 } }).webp({ quality: 60, effort: 6 }).toFile(path.join(ICONS, `${id}.webp`))
  }
  console.log(`Icons: ${queue.length} saved, ${new Set(ids).size - queue.length} already there`)
}

const MAPS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/images/maps")
const MAP_SIZE = 1024

/**
 * A map as the game draws it: its texture, times its parchment background when it has one. A few have a background
 * that's all clear, as their texture has it drawn in already, the middle is checked as some have a clear border.
 * @param {string} id Map.Id, like "r2f1/00"
 * @returns {{ width: number, height: number, rgba: Buffer } | null} Null when there's no such map
 */
function mapImage(id) {
  const [zone, index] = id.split("/")
  const base = `ui/map/${zone}/${index}/${zone}${index}`
  const map = readTexture(`${base}_m.tex`)
  const background = map && readTexture(`${base}m_m.tex`)
  if (!background) return map
  const middle = ((background.height >> 1) * background.width + (background.width >> 1)) * 4
  if (background.rgba.subarray(middle, middle + 4).every((v) => v === 0)) return map
  for (let i = 0; i < map.rgba.length; i++) map.rgba[i] = Math.floor(map.rgba[i] * background.rgba[i] / 255)
  return map
}

/**
 * Saves maps to src/images/maps/ as WebP, half the game's 2048px. Maps already there are kept, delete one to make it
 * again after a patch redraws it.
 * @param {string[]} ids Map.Id values like "r2f1/00", repeats are fine
 * @param {object} [options]
 * @param {boolean} [options.skipMissing] A map with no texture is skipped rather than stopping the script
 * @returns {Promise<Set<string>>} The ids that have no texture, when skipped
 */
export async function saveMaps(ids, { skipMissing = false } = {}) {
  fs.mkdirSync(MAPS, { recursive: true })
  let saved = 0
  const missing = new Set()
  for (const id of new Set(ids)) {
    const file = path.join(MAPS, `${id.replace("/", "-")}.webp`)
    if (fs.existsSync(file)) continue
    const image = mapImage(id)
    if (!image && skipMissing) {
      missing.add(id)
      continue
    }
    if (!image) throw new Error(`No map ${id} in the game's files`)
    await sharp(image.rgba, { raw: { width: image.width, height: image.height, channels: 4 } }).resize(MAP_SIZE).webp({ quality: 70 }).toFile(file)
    saved++
  }
  console.log(`Maps: ${saved} saved, ${new Set(ids).size - saved - missing.size} already there${missing.size ? `, ${missing.size} with no texture` : ""}`)
  return missing
}

// Sheets, everything in them is big-endian

const LANGUAGES = { 0: "", 1: "ja", 2: "en", 3: "de", 4: "fr", 5: "chs", 6: "cht", 7: "ko" }
// The column types, the packed bools after them are a bit each of one byte
const READERS = {
  0x1: (b, at) => b.readUInt8(at) !== 0,
  0x2: (b, at) => b.readInt8(at),
  0x3: (b, at) => b.readUInt8(at),
  0x4: (b, at) => b.readInt16BE(at),
  0x5: (b, at) => b.readUInt16BE(at),
  0x6: (b, at) => b.readInt32BE(at),
  0x7: (b, at) => b.readUInt32BE(at),
  0x9: (b, at) => shortFloat(b.readFloatBE(at)),
  0xa: (b, at) => b.readBigInt64BE(at),
  0xb: (b, at) => b.readBigUInt64BE(at)
}
/**
 * A 32-bit float as the fewest digits that read back as it, 536.716 rather than the 536.716003 its double is.
 * @param {number} value
 * @returns {number}
 */
function shortFloat(value) {
  for (let digits = 1; digits < 9; digits++) {
    const short = Number(value.toPrecision(digits))
    if (Math.fround(short) === value) return short
  }
  return value
}

const STRING = 0x0
const PACKED_BOOL = 0x19
const SUBROWS = 2
const EXD_HEADER = 0x20
const ROW_HEADER = 6

/**
 * @param {string} name "Item", "quest/..." for the ones in folders
 * @returns {{ columns: { type: number, offset: number }[], pages: { start: number, rows: number }[], languages: string[], size: number, subrows: boolean }}
 */
function header(name) {
  const b = readFile(`exd/${name}.exh`)
  if (!b) throw new Error(`No sheet called ${name}`)
  const size = b.readUInt16BE(6)
  const columnCount = b.readUInt16BE(8)
  const pageCount = b.readUInt16BE(10)
  const languageCount = b.readUInt16BE(12)
  const subrows = b.readUInt8(17) === SUBROWS
  let at = 32
  const columns = []
  for (let i = 0; i < columnCount; i++, at += 4) columns.push({ type: b.readUInt16BE(at), offset: b.readUInt16BE(at + 2) })
  // In the order they are in the row, which the column names go by. A packed bool's type is its bit
  columns.sort((a, c) => a.offset - c.offset || a.type - c.type)
  const pages = []
  for (let i = 0; i < pageCount; i++, at += 8) pages.push({ start: b.readUInt32BE(at), rows: b.readUInt32BE(at + 4) })
  const languages = []
  for (let i = 0; i < languageCount; i++, at += 2) languages.push(LANGUAGES[b.readUInt8(at)])
  return { columns, pages, languages, size, subrows }
}

/**
 * An integer inside a string's macro: small ones are a byte plus one, bigger ones say which of the next bytes follow.
 * @param {Buffer} b
 * @param {number} at
 * @returns {[number, number]} The value, and where it ends
 */
function macroInt(b, at) {
  const marker = b[at++]
  if (marker < 0xf0) return [marker - 1, at]
  const flags = (marker + 1) & 0x0f
  let value = 0
  for (let shift = 24; shift >= 0; shift -= 8) if (flags & (1 << (shift / 8))) value |= b[at++] << shift
  return [value >>> 0, at]
}

// The macros that stand for a character, and bold and italics as Markdown does: a ship's name is in italics, and a
// highlight's glow (0x49), set where it starts and reset where it ends, is bold. The rest (colors, conditions) are left out
const MACRO_TEXT = { 0x10: "\n", 0x16: "\u00ad", 0x19: "**", 0x1a: "*", 0x1d: "\u00a0", 0x1f: "\u2013", 0x49: "**" }

// A choice between texts, like "yes-man" or "yes-woman" by the character: its first text, as the CSVs show it
const IF = 0x08
// What starts a text inside a macro
const TEXT = 0xff

/**
 * A game string, its macros between 0x02 and 0x03.
 * @param {Buffer} b
 * @param {number} at
 * @param {number} [end] Where it ends, a string inside a macro isn't null-terminated
 * @returns {string}
 */
function gameString(b, at, end = Infinity) {
  const parts = []
  let start = at
  while (at < end && b[at] !== 0) {
    if (b[at] !== 0x02) {
      at++
      continue
    }
    parts.push(b.toString("utf8", start, at))
    const type = b[at + 1]
    const [length, body] = macroInt(b, at + 2)
    parts.push(type === IF ? firstText(b, body, body + length) : MACRO_TEXT[type] ?? "")
    at = body + length + 1
    start = at
  }
  parts.push(b.toString("utf8", start, at))
  return parts.join("")
}

/**
 * @param {Buffer} b
 * @param {number} at Where the macro's arguments start, the condition first
 * @param {number} end
 * @returns {string} The first text among them
 */
function firstText(b, at, end) {
  const text = b.indexOf(TEXT, at)
  if (text < 0 || text >= end) return ""
  const [length, body] = macroInt(b, text + 1)
  return gameString(b, body, body + length)
}

/**
 * @param {Buffer} b
 * @param {number} at Where the row's fixed part starts
 * @param {number} strings Where its strings start
 * @param {{ type: number, offset: number }[]} columns
 * @returns {any[]}
 */
function rowValues(b, at, strings, columns) {
  return columns.map(({ type, offset }) => {
    if (type === STRING) return gameString(b, strings + b.readUInt32BE(at + offset))
    if (type >= PACKED_BOOL) return (b.readUInt8(at + offset) & (1 << (type - PACKED_BOOL))) !== 0
    return READERS[type](b, at + offset)
  })
}

/**
 * @param {string} name
 * @returns {number} How many columns the sheet has, from its .exh alone
 */
export const columnCount = (name) => header(name).columns.length

/**
 * Every row of a sheet.
 * @param {string} name
 * @param {string} [language]
 * @returns {{ id: string, values: any[] }[]} `id` is "<row>.<subrow>" in a sheet with subrows
 */
export function readSheet(name, language = "en") {
  const { columns, pages, languages, size, subrows } = header(name)
  const suffix = languages.includes(language) ? `_${language}` : ""
  const rows = []
  for (const page of pages) {
    const b = readFile(`exd/${name}_${page.start}${suffix}.exd`)
    if (!b) continue
    const indexSize = b.readUInt32BE(8)
    for (let i = EXD_HEADER; i < EXD_HEADER + indexSize; i += 8) {
      const id = b.readUInt32BE(i)
      const offset = b.readUInt32BE(i + 4)
      const count = b.readUInt16BE(offset + 4)
      const data = offset + ROW_HEADER
      if (!subrows) {
        rows.push({ id: String(id), values: rowValues(b, data, data + size, columns) })
        continue
      }
      // Each subrow is its id then the fixed part, the strings after all of them
      const strings = data + count * (size + 2)
      for (let s = 0; s < count; s++) {
        const at = data + s * (size + 2)
        rows.push({ id: `${id}.${b.readUInt16BE(at)}`, values: rowValues(b, at + 2, strings, columns) })
      }
    }
  }
  return rows
}

// The names of the columns, which the game's sheets don't have, see xivapi.js
const COLUMNS = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "game-columns.json"), "utf8"))

/**
 * A value as the scripts compare it: text, "True" and "False" for a bool. Trimmed, a few names end in a space
 * ("Phallaina "), which a link's underline then runs into.
 * @param {any} value
 * @returns {string}
 */
const asText = (value) => typeof value === "boolean" ? (value ? "True" : "False") : String(value).trim()

/**
 * A sheet from the game's install.
 * @param {string} name Sheet name, like "TerritoryType"
 * @returns {Promise<Record<string, string>[]>} One object per row, keyed by column name
 */
export async function sheet(name) {
  const names = COLUMNS[name]
  if (!names) throw new Error(`${name} has no column names yet, run npm run game-data`)
  return readSheet(name).map(({ id, values }) => {
    if (values.length !== names.length) {
      throw new Error(`${name} has ${values.length} columns but ${names.length} names, a patch changed it: run npm run game-data`)
    }
    return Object.fromEntries([["#", id], ...names.map((n, i) => [n, asText(values[i])])])
  })
}

/**
 * @param {string[]} names
 * @returns {Promise<Record<string, string>[][]>} In the same order as `names`
 */
export const sheets = (names) => Promise.all(names.map(sheet))

/**
 * @param {Record<string, string>[]} rows
 * @returns {Record<string, Record<string, string>>} Row id ("#" column) -> row
 */
export const byId = (rows) => Object.fromEntries(rows.map((r) => [r["#"], r]))

/**
 * The game wraps a ship's name in asterisks for italics, "The *Kobayashi Maru*". Names go into titles, descriptions
 * and alt text, which can't show italics, so they're kept plain.
 * @param {Record<string, string>[]} rows A sheet with a Name column, like PlaceName
 * @returns {Record<string, string>[]}
 */
export const plainNames = (rows) => rows.map((r) => ({ ...r, Name: r.Name.replaceAll("*", "") }))
