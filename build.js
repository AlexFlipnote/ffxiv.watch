import { execFileSync, spawn } from "child_process"
import crypto from "crypto"
import esbuild from "esbuild"
import fs from "fs"
import net from "net"
import os from "os"
import { minify } from "html-minifier-terser"
import path from "path"
import * as sass from "sass"
import { fileURLToPath, pathToFileURL } from "url"
import { escapeHtml, unescapeHtml } from "./src/render/html.js"
import { writeOgImages } from "./src/render/og.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SRC = path.join(__dirname, "src")
const OUT = path.join(__dirname, "dist")
const DOMAIN = "ffxiv.watch"

/**
 * `npm run dev -- --host 0.0.0.0 --port 3000`, the `--` hands the flags to this script instead of npm.
 * @param {string} name
 * @returns {string | undefined}
 */
const devFlag = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}

const DEV_HOST = devFlag("host") ?? "localhost"
const DEV_PORT = Number(devFlag("port")) || 8080

const SKIPPED = ["js", "scss", "partials", "pages", "render"]

const PAGES = path.join(SRC, "pages")

// GitHub Pages looks for it in the root of dist/
const NOT_FOUND = "404.html"

const minifyOptions = {
  collapseWhitespace: true,
  removeComments: true,
  minifyJS: true,
  minifyCSS: true
}

const jsBuildConfigs = [
  { entryPoints: ["src/js/index.js"], outfile: "dist/js/index.js" },
  { entryPoints: ["src/js/404.js"], outfile: "dist/js/404.js" },
  // Code split: each expansion's data is its own chunk, and the code the pages share is in shared chunks
  {
    entryPoints: ["src/js/gathering.js", "src/js/sightseeing.js", "src/js/fishing.js", "src/js/item.js", "src/js/vista.js", "src/js/fish.js"],
    outdir: "dist/js",
    format: "esm",
    splitting: true,
    chunkNames: "chunks/[name]-[hash]"
  }
]

/**
 * @param {object} cfg One of jsBuildConfigs
 * @param {object} [overrides]
 * @returns {import("esbuild").BuildOptions}
 */
const esbuildOptions = (cfg, overrides = {}) => ({
  bundle: true,
  format: "iife",
  minify: true,
  sourcemap: false,
  target: ["es2020"],
  ...cfg,
  ...overrides
})

/**
 * @param {string} type Short tag, like "HTML"
 * @param {string} message
 */
function log(type, message) {
  const now = new Date()
  const pad = (num) => String(num).padStart(2, "0")
  const formattedDate =
    now.getFullYear() + "-" +
    pad(now.getMonth() + 1) + "-" +
    pad(now.getDate()) + " " +
    pad(now.getHours()) + ":" +
    pad(now.getMinutes()) + ":" +
    pad(now.getSeconds())

  console.log(`[ ${type.padStart(5)} ] ${formattedDate} ${message}`)
}

/**
 * @param {string} file Absolute path
 * @returns {boolean} Inside a folder that's compiled or only used inside pages, see SKIPPED
 */
const isSkipped = (file) => SKIPPED.includes(path.relative(SRC, file).split(path.sep)[0])

/**
 * A page to write. Most come one to a file in src/pages/, a [name].html file gives one per entry of its .data.js.
 * @typedef {object} Route
 * @property {string} source "gathering/[item].html", relative to src/pages/
 * @property {string} output Where it goes in dist/: "gathering/cedar-log/index.html"
 * @property {string} url "/gathering/cedar-log/"
 * @property {Record<string, any>} props What its {{ placeholders }} are filled with
 * @property {string[]} sources Files its content comes from, relative to src/, for the sitemap's lastmod
 */

/**
 * @param {string} dir
 * @returns {string[]} Every .html file in it and its subfolders, relative to src/pages/ with / separators
 */
const htmlFiles = (dir = PAGES) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(dir, entry.name)
  if (entry.isDirectory()) return htmlFiles(file)
  return entry.name.endsWith(".html") ? [path.relative(PAGES, file).split(path.sep).join("/")] : []
})

/**
 * @param {string} file "gathering/index.html", "404.html"
 * @returns {string} Where it goes in dist/. Other names get their own folder, "about.html" -> "about/index.html"
 */
const pageOutput = (file) => file === NOT_FOUND || file.endsWith("index.html") ? file : file.replace(/\.html$/, "/index.html")

/**
 * @param {string} output "gathering/index.html"
 * @returns {string} "/gathering/", "/" for index.html
 */
const outputUrl = (output) => "/" + output.replace(/(^|\/)index\.html$/, "$1")

/**
 * Every page in src/pages/, each folder's index.html first, so the front page leads the sitemap and a list comes
 * before its items. A page's .data.js, when it has one, default exports `() => props`. For a [name].html page it
 * returns a list instead, one `{ slug, ...props }` per page. Either can have a `sources` list (relative to src/) of
 * the data it's made from.
 * @returns {Promise<Route[]>}
 */
async function listRoutes() {
  const sortKey = (file) => file.replace(/index\.html$/, "")
  const files = htmlFiles().sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const routes = []

  for (const source of files) {
    const dataFile = source.replace(/\.html$/, ".data.js")
    const hasData = fs.existsSync(path.join(PAGES, dataFile))
    const data = hasData ? await (await import(pathToFileURL(path.join(PAGES, dataFile)))).default() : {}
    const own = [`pages/${source}`, ...hasData ? [`pages/${dataFile}`] : []]

    if (!/\[\w+\]\.html$/.test(source)) {
      const output = pageOutput(source)
      routes.push({ source, output, url: outputUrl(output), props: data, sources: [...own, ...data.sources ?? []] })
      continue
    }

    if (!Array.isArray(data)) throw new Error(`pages/${dataFile}: a [name].html page needs a list of pages`)
    const seen = new Set()
    for (const { slug, sources = [], ...props } of data) {
      if (seen.has(slug)) throw new Error(`pages/${dataFile}: two pages are both "${slug}"`)
      seen.add(slug)
      const output = source.replace(/\[\w+\]\.html$/, `${slug}/index.html`)
      routes.push({ source, output, url: outputUrl(output), props, sources: [...own, ...sources] })
    }
  }
  return routes
}

async function clean() {
  log("CLEAN", "Removing build folder...")
  // Retries, as the dev server can be writing a file into it right then
  await fs.promises.rm(OUT, { recursive: true, force: true, maxRetries: 5 })
  log("CLEAN", "Done")
}

async function copyAssets() {
  log("ASSET", "Copying assets...")
  fs.cpSync(SRC, OUT, {
    recursive: true,
    filter: (file) => !isSkipped(file) && !file.endsWith(".html")
  })
  log("ASSET", "Done copying assets")
}

// "/js/gathering.js" -> the chunks it imports up front, filled by buildJS for the modulepreload links
const chunkImports = new Map()
// "data/gathering/dawntrail.json" (relative to src/js/) -> "/js/chunks/dawntrail-hash.js", for <x-js preload="...">
const entryChunks = new Map()

/** @param {object} [overrides] esbuild options for every config */
async function buildJS(overrides = {}) {
  log("JS", "Building JS...")
  const results = await Promise.all(jsBuildConfigs.map(cfg => esbuild.build(esbuildOptions(cfg, { metafile: true, ...overrides }))))

  const url = (file) => "/" + path.relative(OUT, path.resolve(file)).split(path.sep).join("/")
  for (const [file, output] of results.flatMap(r => Object.entries(r.metafile.outputs))) {
    const imports = output.imports.filter(i => i.kind === "import-statement").map(i => url(i.path))
    if (imports.length) chunkImports.set(url(file), imports)
    if (output.entryPoint) entryChunks.set(path.relative(path.join(SRC, "js"), output.entryPoint).split(path.sep).join("/"), url(file))
  }
  log("JS", "Done building the JS")
}

async function buildCSS() {
  log("CSS", "Converting SCSS to CSS")
  const result = sass.compile(path.join(SRC, "scss/index.scss"), { style: "compressed" })
  const outputFile = path.join(OUT, "css/index.css")
  fs.mkdirSync(path.dirname(outputFile), { recursive: true })
  fs.writeFileSync(outputFile, result.css)
  log("CSS", "Done building the CSS")
}

/*
  Custom tags, usable in any page or partial:
  - <x-html str="partials/navbar.html"/>  pastes in the partial (partials can include partials)
  - <x-js src="index.js"/>                <script src="/js/index.js?v=hash">, add `module` for code split pages
                                          (those also get a modulepreload for each chunk they import up front,
                                          and preload="data/x.json" adds one for a file they import() later)
  - <x-css src="index.css"/>              <link href="/css/index.css?v=hash" rel="stylesheet">
  - <x-seo title="..." description="..."/>  <title>, description, canonical URL and link preview tags. Optional:
                                          image="..." image-alt="..." image-size="WxH" for its own preview image, and
                                          section="..." name="..." for its breadcrumb in search results
  Placeholders, filled from the page's .data.js:
  - {{ name }}                            the value as text
  - {{{ name }}}                          the value as HTML, on a line of its own each line is indented like it
  Links to the page they're on get aria-current="page", which marks the active navbar link. Links to the section
  it's in, like /gathering/ on an item's page, get aria-current="true".
*/

// Per build: "/js/index.js" -> "/js/index.js?v=hash", and a page's file -> its HTML with the partials pasted in
const assetUrls = new Map()
const templates = new Map()

/**
 * @param {string} file "/js/index.js"
 * @param {boolean} hashed Production builds add ?v=hash, so browsers and Cloudflare fetch it fresh after a deploy
 * @returns {string}
 */
function assetUrl(file, hashed) {
  if (!hashed) return file
  if (!assetUrls.has(file)) {
    const content = fs.readFileSync(path.join(OUT, file))
    assetUrls.set(file, `${file}?v=${crypto.createHash("md5").update(content).digest("hex").slice(0, 8)}`)
  }
  return assetUrls.get(file)
}

/**
 * Pastes in the <x-html> partials, each indented like its tag, so partials are written unindented.
 * @param {string} html
 * @param {string} from For errors, the file `html` came from
 * @param {number} [depth]
 * @returns {string}
 */
function includeHtml(html, from, depth = 0) {
  if (depth > 10) throw new Error(`${from}: <x-html> nested too deep, is a partial including itself?`)

  return html.replace(/^([ \t]*)<x-html\s+str="([^"]+)"\s*\/?>/gm, (_, indent, file) => {
    const partial = path.join(SRC, file)
    if (!fs.existsSync(partial)) throw new Error(`${from}: <x-html> can't find src/${file}`)
    return includeHtml(fs.readFileSync(partial, "utf8"), file, depth + 1)
      .trimEnd()
      .split("\n")
      .map(line => line.trim() ? indent + line : "")
      .join("\n")
  })
}

/**
 * @param {string} html
 * @param {Record<string, any>} props
 * @param {string} from For errors, the page's file
 * @returns {string}
 */
function fillPlaceholders(html, props, from) {
  const value = (name) => {
    if (props[name] === undefined) throw new Error(`${from}: nothing to fill {{ ${name} }} with`)
    return String(props[name])
  }

  // One pass, so what's filled in is never searched for placeholders itself
  const placeholder = /^([ \t]*)\{\{\{\s*(\w+)\s*\}\}\}[ \t]*$|\{\{\{\s*(\w+)\s*\}\}\}|\{\{\s*(\w+)\s*\}\}/gm
  return html.replace(placeholder, (_, indent, line, inline, text) => {
    if (line) return value(line).split("\n").map(l => l.trim() ? indent + l : "").join("\n")
    return inline ? value(inline) : escapeHtml(value(text))
  })
}

// Search results cut descriptions off around here, longer ones are cut at a word instead, so they end on "..."
const MAX_DESCRIPTION = 160

/**
 * @param {string} description HTML, as the <x-seo> attribute has it
 * @returns {string} At most MAX_DESCRIPTION characters of text, still HTML
 */
function fitDescription(description) {
  const text = unescapeHtml(description)
  if (text.length <= MAX_DESCRIPTION) return description
  const cut = text.slice(0, MAX_DESCRIPTION - 3)
  return escapeHtml(`${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,.;:-]+$/, "")}...`)
}

/**
 * @param {Route} route
 * @param {string} attrs The <x-seo> tag's attributes, needs a title and a description
 * @returns {string[]} The tags, one per line
 */
function seoTags(route, attrs) {
  const attr = (name) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]
  const title = attr("title")
  const description = attr("description") && fitDescription(attr("description"))
  if (!title || !description) throw new Error(`pages/${route.source}: <x-seo> needs a title and a description`)

  const url = `https://${DOMAIN}${route.url}`
  const meta = (key, name, content) => `<meta ${key}="${name}" content="${content}">`
  // The attributes are HTML, the JSON is in a <script>, where only "</script" could end it early
  const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`

  // Lets Google show "ffxiv.watch" as the site name in results, it only reads this from the front page
  const siteName = route.url === "/"
    ? [jsonLd({ "@context": "https://schema.org", "@type": "WebSite", name: DOMAIN, url })]
    : []

  // A page in a section, section="Gathering" name="Cedar Log", shows as ffxiv.watch › Gathering › Cedar Log in results
  const crumbs = [
    [DOMAIN, `https://${DOMAIN}/`],
    [attr("section"), `https://${DOMAIN}${route.url.replace(/[^/]+\/$/, "")}`],
    [attr("name"), url]
  ]
  const breadcrumbs = attr("section") && attr("name")
    ? [jsonLd({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name: unescapeHtml(name), item }))
    })]
    : []

  // Its own preview, image="/images/og/hash.jpg" image-alt="..." image-size="1024x536", see render/og.js. The banner
  // when it has none
  const [width, height] = (attr("image-size") ?? "").split("x").map(Number)
  const image = attr("image")
    ? { src: `https://${DOMAIN}${attr("image")}`, width, height, alt: attr("image-alt") }
    : { src: `https://${DOMAIN}/images/banner.png`, width: 1200, height: 630, alt: `${DOMAIN}: Eorzea time, on your time.` }
  // A wide image shows across the whole preview, a square one, like an item's icon, as a thumbnail next to the text
  const card = image.width > image.height ? "summary_large_image" : "summary"

  return [
    `<title>${title}</title>`,
    meta("name", "description", description),
    `<link rel="canonical" href="${url}">`,
    meta("property", "og:locale", "en_US"),
    meta("property", "og:type", "website"),
    meta("property", "og:site_name", DOMAIN),
    meta("property", "og:title", title),
    meta("property", "og:description", description),
    meta("property", "og:url", url),
    meta("property", "og:image", image.src),
    meta("property", "og:image:width", image.width),
    meta("property", "og:image:height", image.height),
    meta("property", "og:image:alt", image.alt),
    meta("name", "twitter:card", card),
    ...siteName,
    ...breadcrumbs
  ]
}

/**
 * @param {Route} route
 * @param {string} [file] An <x-js preload="..."> value, "data/gathering/dawntrail.json"
 * @returns {string[]} Its chunk, none when there's no preload or the JS isn't built in this process (dev renders)
 */
function preloadChunks(route, file) {
  if (!file || !entryChunks.size) return []
  if (!entryChunks.has(file)) throw new Error(`pages/${route.source}: <x-js preload> has no chunk for js/${file}`)
  return [entryChunks.get(file)]
}

/**
 * @param {Route} route
 * @param {boolean} hashed Add ?v=hash to the assets
 * @returns {string} The finished HTML
 */
function renderPage(route, hashed) {
  if (!templates.has(route.source)) {
    templates.set(route.source, includeHtml(fs.readFileSync(path.join(PAGES, route.source), "utf8"), `pages/${route.source}`))
  }

  return fillPlaceholders(templates.get(route.source), route.props, `pages/${route.source}`)
    .replace(/^([ \t]*)<x-seo\s+([^>]*?)\s*\/?>/gm, (_, indent, attrs) =>
      seoTags(route, attrs).map(tag => indent + tag).join("\n"))
    .replace(/^([ \t]*)<x-js\s+src="([^"]+)"(\s+module)?(?:\s+preload="([^"]+)")?\s*\/?>/gm, (_, indent, file, module, preload) => [
      ...(module ? chunkImports.get(`/js/${file}`) ?? [] : []).map(chunk => `<link rel="modulepreload" href="${chunk}">`),
      ...preloadChunks(route, preload).map(chunk => `<link rel="modulepreload" href="${chunk}">`),
      `<script${module ? " type=\"module\"" : ""} src="${assetUrl(`/js/${file}`, hashed)}"></script>`
    ].map(tag => indent + tag).join("\n"))
    .replace(/<x-css\s+src="([^"]+)"\s*\/?>/g, (_, file) =>
      `<link href="${assetUrl(`/css/${file}`, hashed)}" type="text/css" rel="stylesheet">`)
    .replace(/<a\b([^>]*\bhref="([^"]+)"[^>]*)>/g, (tag, attrs, href) => {
      if (href === route.url) return `<a${attrs} aria-current="page">`
      if (href !== "/" && href.endsWith("/") && route.url.startsWith(href)) return `<a${attrs} aria-current="true">`
      return tag
    })
}

/**
 * @param {boolean} [hashed] Production build: hashed asset links and minified HTML
 * @returns {Promise<Route[]>} The pages written
 */
async function buildHTML(hashed = true) {
  log("HTML", "Rendering pages...")
  assetUrls.clear()
  templates.clear()

  const routes = await listRoutes()
  for (const route of routes) {
    const outputFile = path.join(OUT, route.output)
    fs.mkdirSync(path.dirname(outputFile), { recursive: true })
    const html = renderPage(route, hashed)
    fs.writeFileSync(outputFile, hashed ? await minify(html, minifyOptions) : html)
  }
  log("HTML", `Done rendering ${routes.length} pages`)
  return routes
}

// Sorted file list -> its lastmod, many pages are made from the same files
const lastmods = new Map()

/**
 * @param {string[]} files Relative to src/
 * @returns {string | null} YYYY-MM-DD of the last commit that changed one of them, null without git
 */
function lastModified(files) {
  const key = [...new Set(files)].sort().join("|")
  if (!lastmods.has(key)) {
    try {
      const date = execFileSync("git", ["log", "-1", "--format=%cs", "--", ...key.split("|").map(f => `src/${f}`)], {
        cwd: __dirname,
        encoding: "utf8"
      }).trim()
      // Not committed yet, so changed today
      lastmods.set(key, date || new Date().toISOString().slice(0, 10))
    } catch {
      lastmods.set(key, null)
    }
  }
  return lastmods.get(key)
}

/**
 * @param {Route[]} routes From buildHTML
 * @param {boolean} [dated] Add each page's lastmod, from git, which takes a moment
 */
async function buildSite(routes, dated = true) {
  log("SITE", "Writing CNAME, sitemap.xml and robots.txt")

  // Every deploy wipes gh-pages, so the custom domain has to be written each time
  fs.writeFileSync(path.join(OUT, "CNAME"), DOMAIN + "\n")

  const urls = routes
    .filter(route => route.source !== NOT_FOUND)
    .map(route => {
      const lastmod = dated && lastModified(route.sources)
      return `  <url><loc>https://${DOMAIN}${route.url}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`
    })

  fs.writeFileSync(path.join(OUT, "sitemap.xml"), [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
    ...urls,
    "</urlset>",
    ""
  ].join("\n"))

  fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: serpstatbot\nDisallow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: https://${DOMAIN}/sitemap.xml\n`)

  log("SITE", `Done, ${urls.length} pages in the sitemap`)
}

/** The link preview images the pages rendered in this process asked for, left out of dev builds as they take a while */
async function buildOgImages() {
  log("OG", "Drawing the link preview images...")
  log("OG", `Done, ${await writeOgImages(OUT)} images`)
}

async function build() {
  await clean()
  await copyAssets()
  await buildJS()
  await buildCSS()
  // After JS and CSS, since the ?v=hash is made from the built files
  await buildSite(await buildHTML())
  await buildOgImages()
}

const jsWatchPlugin = {
  name: "watch-log",
  setup(build) {
    build.onStart(() => log("JS", "Building JS..."))
    build.onEnd(result => log("JS", result.errors.length ? "Error" : "Done building"))
  }
}

// What the pages are made from, a change in any of these renders them again
const HTML_SOURCES = ["pages", "partials", "render", "js/data", "js/utils"]

let rendering = null
let renderAgain = false

/**
 * Renders the pages in a new process, so the .data.js files and everything they import load fresh, Node would
 * otherwise keep the first copy. A change while it runs renders once more after.
 */
function rebuildHTML() {
  if (rendering) {
    renderAgain = true
    return
  }
  rendering = spawn(process.execPath, [__filename, "html"], { stdio: "inherit" })
  rendering.on("exit", () => {
    rendering = null
    if (renderAgain) {
      renderAgain = false
      rebuildHTML()
    }
  })
}

/**
 * @param {number} port
 * @param {string} host
 * @returns {Promise<void>} Rejects when something is already listening on it
 */
const portFree = (port, host) => new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once("error", reject)
  server.listen(port, host, () => server.close(() => resolve()))
})

/** @returns {string[]} This machine's addresses on the local network, to open the dev server from a phone */
const lanAddresses = () => Object.values(os.networkInterfaces()).flat()
  .filter((i) => i.family === "IPv4" && !i.internal)
  .map((i) => i.address)

async function watch() {
  log("WATCH", "Starting to watch for changes...")

  const contexts = await Promise.all(
    jsBuildConfigs.map(cfg => esbuild.context(esbuildOptions(cfg, {
      minify: false,
      sourcemap: true,
      plugins: [jsWatchPlugin]
    })))
  )

  // The port first, so a second `npm run dev` stops here, before it wipes the files the running one serves
  try {
    await portFree(DEV_PORT, DEV_HOST)
  } catch (err) {
    await Promise.all(contexts.map(ctx => ctx.dispose()))
    log("SERVE", `Port ${DEV_PORT} is taken, is \`npm run dev\` already running? (${err.message})`)
    process.exit(1)
  }

  await clean()
  await copyAssets()
  await buildCSS()
  await buildSite(await buildHTML(false), false)
  // Served only now: a tab left open asks for the page at once, and the server builds the JS for it, which would
  // land in the folder while it's being wiped. Any esbuild context can serve the whole output folder
  await contexts[0].serve({ servedir: OUT, host: DEV_HOST, port: DEV_PORT })
  await Promise.all(contexts.map(ctx => ctx.watch()))
  const hosts = DEV_HOST === "0.0.0.0" ? ["localhost", ...lanAddresses()] : [DEV_HOST]
  for (const host of hosts) log("SERVE", `http://${host}:${DEV_PORT}/`)

  // A deleted or renamed file would leave its old output behind, so that starts over from an empty folder.
  // A rename fires a few events at once, they wait for each other
  let restart = null
  const rebuildAll = async () => {
    log("WATCH", "A file was removed, building everything again...")
    await clean()
    await copyAssets()
    await buildCSS()
    await Promise.all(contexts.map(ctx => ctx.rebuild()))
    rebuildHTML()
  }

  fs.watch(SRC, { recursive: true }, (_, filename) => {
    if (!filename) return
    const file = path.join(SRC, filename)
    if (!fs.existsSync(file)) {
      clearTimeout(restart)
      restart = setTimeout(() => rebuildAll().catch(err => log("WATCH", err.message)), 200)
      return
    }
    if (file.startsWith(path.join(SRC, "scss")))
      buildCSS().catch(err => log("CSS", err.message))
    else if (HTML_SOURCES.some(dir => file.startsWith(path.join(SRC, dir))))
      rebuildHTML()
    else if (!isSkipped(file))
      copyAssets().catch(err => log("ASSET", err.message))
  })
}

switch (process.argv[2]) {
case "clean": await clean(); break
case "watch": await watch(); break
case "html":  await buildSite(await buildHTML(false), false); break
default:      await build(); break
}
