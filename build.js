import crypto from "crypto"
import esbuild from "esbuild"
import fs from "fs"
import { minify } from "html-minifier-terser"
import path from "path"
import * as sass from "sass"
import { fileURLToPath, pathToFileURL } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SRC = path.join(__dirname, "src")
const OUT = path.join(__dirname, "dist")
const DOMAIN = "ffxiv.watch"
const DEV_PORT = 8080

const SKIPPED = ["js", "scss", "partials", "pages"]

const PAGES = path.join(SRC, "pages")

// GitHub Pages looks for these in the root of dist/, every other page gets its own folder
const ROOT_PAGES = ["index.html", "404.html"]

const minifyOptions = {
  collapseWhitespace: true,
  removeComments: true,
  minifyJS: true,
  minifyCSS: true
}

const NOT_IN_SITEMAP = ["404.html"]

const TIMERS_FILE = path.join(SRC, "js/utils/timers.js")

const jsBuildConfigs = [
  { entryPoints: ["src/js/index.js"], outfile: "dist/js/index.js" },
  { entryPoints: ["src/js/404.js"], outfile: "dist/js/404.js" },
  // Code split: each expansion's data is its own chunk, and the code both pages use is one shared chunk
  {
    entryPoints: ["src/js/gathering.js", "src/js/sightseeing.js"],
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

/** @returns {string[]} Every .html file in src/pages/, the front page first so it leads the sitemap */
const listPages = () => fs.readdirSync(PAGES)
  .filter(file => file.endsWith(".html"))
  .sort((a, b) => (b === "index.html") - (a === "index.html") || a.localeCompare(b))

/**
 * @param {string} page "gathering.html"
 * @returns {string} Where it goes in dist/: "gathering/index.html", root pages as-is
 */
const pageOutput = (page) => ROOT_PAGES.includes(page) ? page : `${page.replace(/\.html$/, "")}/index.html`

/**
 * @param {string} page "gathering.html"
 * @returns {string} "/gathering/", "/" for index.html
 */
const pageUrl = (page) => "/" + pageOutput(page).replace(/(^|\/)index\.html$/, "$1")

async function clean() {
  log("CLEAN", "Removing build folder...")
  await fs.promises.rm(OUT, { recursive: true, force: true })
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

/** @param {object} [overrides] esbuild options for every config */
async function buildJS(overrides = {}) {
  log("JS", "Building JS...")
  const results = await Promise.all(jsBuildConfigs.map(cfg => esbuild.build(esbuildOptions(cfg, { metafile: true, ...overrides }))))

  const url = (file) => "/" + path.relative(OUT, path.resolve(file)).split(path.sep).join("/")
  for (const [file, output] of results.flatMap(r => Object.entries(r.metafile.outputs))) {
    const imports = output.imports.filter(i => i.kind === "import-statement").map(i => url(i.path))
    if (imports.length) chunkImports.set(url(file), imports)
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
                                          (those also get a modulepreload for each chunk they import up front)
  - <x-css src="index.css"/>              <link href="/css/index.css?v=hash" rel="stylesheet">
  - <x-seo title="..." description="..."/>  <title>, description, canonical URL and link preview tags
  - <x-timers/>                           the timer cards, see timerCards()
  Links to the page they're on get aria-current="page", which marks the active navbar link.
*/

/**
 * @param {string} file "/js/index.js"
 * @param {boolean} hashed Production builds add ?v=hash, so browsers and Cloudflare fetch it fresh after a deploy
 * @returns {string}
 */
function assetUrl(file, hashed) {
  if (!hashed) return file
  const content = fs.readFileSync(path.join(OUT, file))
  return `${file}?v=${crypto.createHash("md5").update(content).digest("hex").slice(0, 8)}`
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
 * @param {string} page
 * @param {string} attrs The <x-seo> tag's attributes, needs a title and a description
 * @returns {string[]} The tags, one per line
 */
function seoTags(page, attrs) {
  const attr = (name) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]
  const title = attr("title")
  const description = attr("description")
  if (!title || !description) throw new Error(`${page}: <x-seo> needs a title and a description`)

  const url = `https://${DOMAIN}${pageUrl(page)}`
  const meta = (key, name, content) => `<meta ${key}="${name}" content="${content}">`

  // Lets Google show "ffxiv.watch" as the site name in results, it only reads this from the front page
  const siteName = pageUrl(page) === "/"
    ? [`<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: DOMAIN, url })}</script>`]
    : []

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
    meta("property", "og:image", `https://${DOMAIN}/images/banner.png`),
    meta("property", "og:image:width", "1200"),
    meta("property", "og:image:height", "630"),
    meta("property", "og:image:alt", `${DOMAIN}: Eorzea time, on your time.`),
    meta("name", "twitter:card", "summary_large_image"),
    ...siteName
  ]
}

/** @returns {Promise<object[]>} TIMERS, imported fresh every time so `npm run dev` picks up edits */
const loadTimers = async () => (await import(`${pathToFileURL(TIMERS_FILE)}?v=${Date.now()}`)).TIMERS

/**
 * The timer cards as HTML, so search engines can read them without running JS. index.js finds them by data-id and
 * fills in the countdowns. The hidden details are the modal's text, for search engines only.
 * @param {object[]} timers TIMERS
 * @returns {string[]} Lines of HTML
 */
function timerCards(timers) {
  const indent = (lines) => lines.map(line => "  " + line)

  return timers.flatMap(timer => {
    const details = timer.phases?.map(phase => `<p>${phase.name}: ${phase.info}</p>`)
      ?? timer.regions?.map(region => `<p>${region.name}: ${region.info}</p>`)
      ?? [`<p>${timer.info}</p>`]
    const list = timer.list ? ["<ul>", ...indent(timer.list.map(item => `<li>${item}</li>`)), "</ul>"] : []
    const regions = timer.regions
      ? [
        "<div class=\"region-picker\" role=\"group\" aria-label=\"Region\">",
        ...indent(timer.regions.map(region => `<button class="region-btn">${region.name}</button>`)),
        "</div>"
      ]
      : []

    return [
      `<div class="${timer.small ? "timer small" : "timer"}" data-id="${timer.id}">`,
      ...indent([
        "<div class=\"timer-header\">",
        `  <h2 class="title">${timer.name}</h2>`,
        "  <button class=\"info-btn\" title=\"Details\">i</button>",
        "</div>",
        ...regions,
        "<div class=\"timer-body\">",
        "  <div>",
        "    <div class=\"countdown\"></div>",
        "    <div class=\"target\"><strong></strong> <time></time></div>",
        "  </div>",
        "  <div class=\"side-col\" hidden><div class=\"sub-title\"></div></div>",
        "</div>",
        "<div class=\"timer-details\" hidden>",
        ...indent([...details, ...list]),
        "</div>"
      ]),
      "</div>"
    ]
  })
}

/**
 * @param {string} page File name in src/pages/
 * @param {boolean} hashed Add ?v=hash to the assets
 * @param {{ timers: object[] }} data
 * @returns {string} The finished HTML
 */
function renderPage(page, hashed, { timers }) {
  const url = pageUrl(page)

  return includeHtml(fs.readFileSync(path.join(PAGES, page), "utf8"), `pages/${page}`)
    .replace(/^([ \t]*)<x-seo\s+([^>]*?)\s*\/?>/gm, (_, indent, attrs) =>
      seoTags(page, attrs).map(tag => indent + tag).join("\n"))
    .replace(/^([ \t]*)<x-timers\s*\/?>/gm, (_, indent) =>
      timerCards(timers).map(line => indent + line).join("\n"))
    .replace(/^([ \t]*)<x-js\s+src="([^"]+)"(\s+module)?\s*\/?>/gm, (_, indent, file, module) => [
      ...(module ? chunkImports.get(`/js/${file}`) ?? [] : []).map(chunk => `<link rel="modulepreload" href="${chunk}">`),
      `<script${module ? " type=\"module\"" : ""} src="${assetUrl(`/js/${file}`, hashed)}"></script>`
    ].map(tag => indent + tag).join("\n"))
    .replace(/<x-css\s+src="([^"]+)"\s*\/?>/g, (_, file) =>
      `<link href="${assetUrl(`/css/${file}`, hashed)}" type="text/css" rel="stylesheet">`)
    .replace(/<a\b([^>]*\bhref="([^"]+)"[^>]*)>/g, (tag, attrs, href) =>
      href === url ? `<a${attrs} aria-current="page">` : tag)
}

/** @param {boolean} [hashed] Production build: hashed asset links and minified HTML */
async function buildHTML(hashed = true) {
  log("HTML", "Rendering pages...")
  const pages = listPages()
  const data = { timers: await loadTimers() }
  for (const page of pages) {
    const outputFile = path.join(OUT, pageOutput(page))
    fs.mkdirSync(path.dirname(outputFile), { recursive: true })
    const html = renderPage(page, hashed, data)
    fs.writeFileSync(outputFile, hashed ? await minify(html, minifyOptions) : html)
  }
  log("HTML", `Done rendering ${pages.length} pages`)
}

async function buildSite() {
  log("SITE", "Writing CNAME, sitemap.xml and robots.txt")

  // Every deploy wipes gh-pages, so the custom domain has to be written each time
  fs.writeFileSync(path.join(OUT, "CNAME"), DOMAIN + "\n")

  const urls = listPages()
    .filter(page => !NOT_IN_SITEMAP.includes(page))
    .map(page => `  <url><loc>https://${DOMAIN}${pageUrl(page)}</loc></url>`)

  fs.writeFileSync(path.join(OUT, "sitemap.xml"), [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
    ...urls,
    "</urlset>",
    ""
  ].join("\n"))

  fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: https://${DOMAIN}/sitemap.xml\n`)

  log("SITE", "Done")
}

async function build() {
  await clean()
  await copyAssets()
  await buildJS()
  await buildCSS()
  // After JS and CSS, since the ?v=hash is made from the built files
  await buildHTML()
  await buildSite()
}

const jsWatchPlugin = {
  name: "watch-log",
  setup(build) {
    build.onStart(() => log("JS", "Building JS..."))
    build.onEnd(result => log("JS", result.errors.length ? "Error" : "Done building"))
  }
}

async function watch() {
  log("WATCH", "Starting to watch for changes...")

  await clean()
  await copyAssets()
  await buildCSS()
  await buildHTML(false)
  await buildSite()

  const contexts = await Promise.all(
    jsBuildConfigs.map(cfg => esbuild.context(esbuildOptions(cfg, {
      minify: false,
      sourcemap: true,
      plugins: [jsWatchPlugin]
    })))
  )
  await Promise.all(contexts.map(ctx => ctx.watch()))

  // Any esbuild context can serve the whole output folder
  await contexts[0].serve({ servedir: OUT, port: DEV_PORT })
  log("SERVE", `http://localhost:${DEV_PORT}/`)

  fs.watch(SRC, { recursive: true }, (_, filename) => {
    if (!filename) return
    const file = path.join(SRC, filename)
    if (file.startsWith(path.join(SRC, "scss")))
      buildCSS().catch(err => log("CSS", err.message))
    else if (file.endsWith(".html") || file === TIMERS_FILE)
      buildHTML(false).then(buildSite).catch(err => log("HTML", err.message))
    else if (!isSkipped(file))
      copyAssets().catch(err => log("ASSET", err.message))
  })
}

switch (process.argv[2]) {
case "clean": await clean(); break
case "watch": await watch(); break
default:      await build(); break
}
