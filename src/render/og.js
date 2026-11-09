import { gameIcon } from "../js/utils/images.js"

// Link preview images: the game's icon for what a page is about, an item's, a vista's, a weather zone's crest

/**
 * What a page passes to <x-seo>.
 * @typedef {{ image: string, imageAlt: string, imageSize: string }} OgImage imageSize is "80x80", all empty
 * for none, which gives the site's banner
 */

/**
 * The game's 80px icon, Discord shows a square one as a small thumbnail anyway.
 * @param {number} icon
 * @param {string} name
 * @returns {OgImage}
 */
export const ogIcon = (icon, name) => ({ image: gameIcon(icon), imageAlt: `${name} icon`, imageSize: "80x80" })
