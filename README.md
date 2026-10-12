# [ffxiv.watch](https://ffxiv.watch)

*Eorzea time, on your time.*

FFXIV timers, mobile-first for the phone in your hand while you play, and just as at home on a desktop. No plugins, no account, no waiting on a heavy page: open it, see what's up, and get back to the game.

## What's on it
- **Timers**: daily and weekly resets, the housing lottery, leve allowances, Jumbo Cactpot, ocean fishing and Eorzea time
- **Gathering**: every node, when the timed ones are up next, hidden items and scrip rewards
- **Fishing**: every fish with its window, bait path and intuition, and the ocean fishing routes
- **Sightseeing**: every vista, with its emote and when the time and weather line up
- **Weather**: every zone now and ahead, and a finder for the weather you're waiting on
- **PvP maps**: today's Frontline and this hour's Crystalline Conflict map

Everything is shown in your local time, with your progress kept on your device.

## How it's built
Static pages with no framework and no backend. Each list loads only the expansion it shows, and the timers only wake when something on screen can change, so it stays light on a phone.

## Credits
- **[Carbuncle Plushy's fish tracker](https://github.com/icykoneko/ff14-fish-tracker-app)** for when each fish bites, its bait and intuition
- **[Teamcraft](https://github.com/ffxiv-teamcraft/ffxiv-teamcraft)** for the bait, hookset and tug of the other fish, blue fish times and hidden node items
- [PvP Calendar](https://pvpc.nbb.fan/) for the Frontline and Crystalline Conflict rotations
- [XIVAPI's ffxiv-datamining](https://github.com/xivapi/ffxiv-datamining) for the game data, and [XIVAPI](https://v2.xivapi.com/) for the maps and icons
- [Google Sans Flex](https://fonts.google.com/specimen/Google+Sans+Flex) (OFL), [Material Symbols](https://fonts.google.com/icons) (Apache 2.0) and the Lodestone's icon font via [ffxiv-axis-font-icons](https://github.com/thewakingsands/ffxiv-axis-font-icons)

## License
The code is under the [AGPL-3.0](LICENSE). The fish tracker's data (© 2019 icykoneko) and Teamcraft's (© 2017 Flavien Normand) are used under the MIT License ([tracker](https://github.com/icykoneko/ff14-fish-tracker-app/blob/master/LICENSE), [Teamcraft](https://github.com/ffxiv-teamcraft/ffxiv-teamcraft/blob/staging/LICENSE)).

FINAL FANTASY XIV © SQUARE ENIX CO., LTD. All rights reserved. ffxiv.watch isn't affiliated with Square Enix.
