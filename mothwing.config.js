import { defineConfig, log } from "mothwing"
import { writeOgImages } from "./src/render/og.js"

/**
 * A styled select (base-select, see _controls.scss) is as wide as its picked option, so the filters would shift with
 * every pick, and on the first one. Each gets its options' text, invisible, in the same grid cell, so it's as wide as
 * the widest from the first paint, like a native one.
 * @param {string} html
 * @returns {string}
 */
const sizeSelects = (html) => html.replace(/<select class="select"[^>]*>([\s\S]*?)<\/select>/g, (select, options) => {
  const texts = [...options.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map(([, text]) => `<span>${text}</span>`)
  return `<span class="select-box">${select}<span class="select select-sizer" aria-hidden="true">${texts.join("")}</span></span>`
})

export default defineConfig({
  domain: "ffxiv.watch",
  js: {
    scripts: ["js/index.js", "js/page.js"],
    modules: [
      "js/gathering.js", "js/sightseeing.js", "js/fishing.js", "js/item.js", "js/vista.js", "js/fish.js",
      "js/weather.js", "js/weather-zone.js", "js/ocean.js", "js/pvp.js", "js/events.js", "js/reset.js"
    ]
  },
  sass: { "scss/index.scss": "css/index.css" },
  // images/zones is what render/og.js draws the weather zones' previews from
  exclude: ["js", "scss", "render", "images/zones"],
  // The game data the pages read with fs
  rerender: ["js/data"],
  seo: {
    image: { src: "/images/banner.png", width: 1200, height: 630, alt: "ffxiv.watch: Eorzea time, on your time." }
  },
  minify: true,
  // Inline styles for the map markers' positions
  csp: { "style-src": "'self' 'unsafe-inline'" },
  sitemap: { sections: ["fishing", "gathering", "sightseeing", "weather"] },
  robots: {
    // SEO crawlers that only feed a paid backlink database and send no one here
    block: [
      "AhrefsBot",
      "Barkrowler", // Babbar
      "BLEXBot", // WebMeUp
      "DataForSeoBot",
      "DotBot", // Moz
      "linkdexbot",
      "MegaIndex.ru",
      "MJ12bot", // Majestic
      "rogerbot", // Moz
      "SemrushBot",
      "SEOkicks",
      "SERankingBacklinksBot", // seranking.com
      "serpstatbot",
      "spbot" // OpenLinkProfiler
    ],
    disallow: ["/rows/"]
  },
  cname: true,
  // The reset pages are the timers', though not under / like a section's pages are under theirs
  activeLinks: (href, route) => href === "/" && route.source === "[reset].html" ? "section" : undefined,
  transforms: [sizeSelects],
  // The link preview images the pages asked for, left out of dev builds as they take a while
  after: [async ({ site, dev }) => {
    if (dev) return
    log("OG", "Drawing the link preview images...")
    log("OG", `Done, ${await writeOgImages(site.out)} images`)
  }]
})
