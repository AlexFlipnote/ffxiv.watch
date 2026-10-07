import crypto from "crypto"
import esbuild from "esbuild"
import fs from "fs"
import path from "path"
import * as sass from "sass"
import { fileURLToPath, pathToFileURL } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SRC = path.join(__dirname, "src")
const OUT = path.join(__dirname, "dist")
const DOMAIN = "ffxiv.watch"
const DEV_PORT = 8080

// Folders in src/ that never get copied as-is: compiled (js, scss) or only used inside pages (partials)
const SKIPPED = ["js", "scss", "partials"]

const NOT_IN_SITEMAP = ["404.html"]

const TIMERS_FILE = path.join(SRC, "js/utils/timers.js")
const ZONES_FILE = path.join(SRC, "js/data/weather.json")

const jsBuildConfigs = [
  { entryPoints: ["src/js/index.js"], outfile: "dist/js/index.js" },
  { entryPoints: ["src/js/weather.js"], outfile: "dist/js/weather.js" },
  { entryPoints: ["src/js/404.js"], outfile: "dist/js/404.js" }
]

const esbuildOptions = (cfg, overrides = {}) => ({
  bundle: true,
  format: "iife",
  minify: true,
  sourcemap: false,
  target: ["es2020"],
  ...cfg,
  ...overrides
})

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

const isSkipped = (file) => SKIPPED.includes(path.relative(SRC, file).split(path.sep)[0])

// Every .html file in src/ except partials, as paths relative to src/ ("index.html", "resets/index.html")
const listPages = () => fs.readdirSync(SRC, { recursive: true })
  .filter(file => file.endsWith(".html") && !isSkipped(path.join(SRC, file)))
  .map(file => file.split(path.sep).join("/"))

// "index.html" -> "/", "resets/index.html" -> "/resets/", "404.html" -> "/404.html"
const pageUrl = (page) => "/" + page.replace(/(^|\/)index\.html$/, "$1")

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

async function buildJS(overrides = {}) {
  log("JS", "Building JS...")
  await Promise.all(jsBuildConfigs.map(cfg => esbuild.build(esbuildOptions(cfg, overrides))))
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
  - <x-html str="partials/topbar.html"/>  pastes in src/partials/topbar.html (partials can include partials)
  - <x-js src="index.js"/>                <script src="/js/index.js?v=hash"></script>
  - <x-css src="index.css"/>              <link href="/css/index.css?v=hash" rel="stylesheet">
  - <x-seo title="..." description="..."/>  <title>, description, canonical URL and link preview tags
  - <x-timers/>                           the timer cards from src/js/utils/timers.js, see timerCards()
  - <x-zones/>                            the weather zones from src/js/data/weather.json as <option>s, grouped by expansion

  The ?v=hash is only added on production builds, so browsers and Cloudflare fetch the new file after a deploy.
  Links pointing at the page they're on get aria-current="page", which is how the topbar marks the active page.
*/
function assetUrl(file, hashed) {
  if (!hashed) return file
  const content = fs.readFileSync(path.join(OUT, file))
  return `${file}?v=${crypto.createHash("md5").update(content).digest("hex").slice(0, 8)}`
}

function includeHtml(html, from, depth = 0) {
  if (depth > 10) throw new Error(`${from}: <x-html> nested too deep, is a partial including itself?`)

  // Every line of the partial gets the same indent as the <x-html> tag, so partials are written unindented
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

// Fresh import every build, so `npm run dev` picks up edits to the timers
const loadTimers = async () => (await import(`${pathToFileURL(TIMERS_FILE)}?v=${Date.now()}`)).TIMERS

/*
  The cards are written into the page so search engines can read them without running JS or clicking anything.
  index.js finds them by data-id and fills in the countdowns. The hidden details are the modal's text,
  only there for search engines, the modal itself is still filled from getAllTimerStates().
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

// Written into the page for the same reason as the timer cards, weather.js only picks the saved zone
function zoneOptions(zones) {
  const groups = Map.groupBy(zones, zone => zone.group)
  return [...groups].flatMap(([group, members]) => [
    `<optgroup label="${group}">`,
    ...members.map(zone => `  <option>${zone.name}</option>`),
    "</optgroup>"
  ])
}

function renderPage(page, hashed, { timers, zones }) {
  const url = pageUrl(page)

  return includeHtml(fs.readFileSync(path.join(SRC, page), "utf8"), page)
    .replace(/^([ \t]*)<x-seo\s+([^>]*?)\s*\/?>/gm, (_, indent, attrs) =>
      seoTags(page, attrs).map(tag => indent + tag).join("\n"))
    .replace(/^([ \t]*)<x-timers\s*\/?>/gm, (_, indent) =>
      timerCards(timers).map(line => indent + line).join("\n"))
    .replace(/^([ \t]*)<x-zones\s*\/?>/gm, (_, indent) =>
      zoneOptions(zones).map(line => indent + line).join("\n"))
    .replace(/<x-js\s+src="([^"]+)"\s*\/?>/g, (_, file) =>
      `<script src="${assetUrl(`/js/${file}`, hashed)}"></script>`)
    .replace(/<x-css\s+src="([^"]+)"\s*\/?>/g, (_, file) =>
      `<link href="${assetUrl(`/css/${file}`, hashed)}" type="text/css" rel="stylesheet">`)
    .replace(/<a\b([^>]*\bhref="([^"]+)"[^>]*)>/g, (tag, attrs, href) =>
      href === url ? `<a${attrs} aria-current="page">` : tag)
}

async function buildHTML(hashed = true) {
  log("HTML", "Rendering pages...")
  const pages = listPages()
  const data = { timers: await loadTimers(), zones: JSON.parse(fs.readFileSync(ZONES_FILE, "utf8")) }
  for (const page of pages) {
    const outputFile = path.join(OUT, page)
    fs.mkdirSync(path.dirname(outputFile), { recursive: true })
    fs.writeFileSync(outputFile, renderPage(page, hashed, data))
  }
  log("HTML", `Done rendering ${pages.length} pages`)
}

async function buildSite() {
  log("SITE", "Writing CNAME, sitemap.xml and robots.txt")

  // Tells GitHub Pages which domain the site is on, has to be in every deploy since gh-pages gets wiped
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
    else if (file.endsWith(".html") || file === TIMERS_FILE || file === ZONES_FILE)
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
