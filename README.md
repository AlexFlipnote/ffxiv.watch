# [ffxiv.watch](https://ffxiv.watch)

*Eorzea time, on your time.*

FFXIV timers, mobile-first for the phone in your hand while you play, and just as at home on a desktop. No plugins, no account, no waiting on a heavy page: open it, see what's up, and get back to the game. Everything is shown in your local time, with your progress kept on your device.

## How it's built
Static pages with no framework and no backend. Each list loads only the expansion it shows, and the timers only wake when something on screen can change, so it stays light on a phone.

The game's data, icons and maps are read from its own files, see [.env.example](.env.example).

Tuned on a Samsung Galaxy A40 as the low end, and tested on iPhone 14 and newer, a Pixel 10 Pro XL, an office PC with integrated graphics (i5-9500T, UHD 630) and a high-end desktop, in Chrome, Firefox, Edge, Safari and Samsung Internet.

## Credits and license
The code is under the [AGPL-3.0](LICENSE). It builds on:

| Project | Used for | License |
| --- | --- | --- |
| [XIVAPI's ffxiv-datamining](https://github.com/xivapi/ffxiv-datamining) | Names of the game sheets' columns | |
| [Carbuncle Plushy's fish tracker](https://github.com/icykoneko/ff14-fish-tracker-app) | When each fish bites, its bait and intuition | [MIT](https://github.com/icykoneko/ff14-fish-tracker-app/blob/master/LICENSE), © 2019 icykoneko |
| [Teamcraft](https://github.com/ffxiv-teamcraft/ffxiv-teamcraft) | Other fish's bait, hookset and tug, blue fish times | [MIT](https://github.com/ffxiv-teamcraft/ffxiv-teamcraft/blob/staging/LICENSE), © 2017 Flavien Normand |
| [Google Sans Flex](https://fonts.google.com/specimen/Google+Sans+Flex) | Font | OFL |
| [Material Symbols](https://fonts.google.com/icons) | Icons | Apache 2.0 |

FINAL FANTASY XIV © SQUARE ENIX CO., LTD. All rights reserved. ffxiv.watch isn't affiliated with Square Enix.
