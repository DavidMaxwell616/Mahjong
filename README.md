# Serene Mahjong

A portrait-first Mahjong Solitaire game inspired by the calm, large-tile accessibility of leading mobile mahjong apps. Built with Phaser 3.90, loaded from jsDelivr.

Classic tile artwork is loaded from `assets/images/tile_spritesheet.png`. Themed artwork is loaded from `assets/images/themes/` and mapped into curated texture frames at runtime.
The game opens with a dedicated `SplashScene` using `splash-maxjong.png` before transitioning into play.

## Run
Open `index.html` in a browser.

If your browser blocks local script loading, run a tiny local server:

    python3 -m http.server 8000

Then visit `http://localhost:8000`.

## Controls
- Click a free tile to select it.
- Selected free tiles move into the four-slot match rack.
- Selecting a matching tile places it beside its partner and clears the pair.
- Hint highlights a matching pair of free tiles (three per level).
- A tile is free when:
  - no tile covers it from a higher layer, and
  - its left or right side is open.
- Shuffle randomizes remaining tiles (three per level).
- Undo first returns an unresolved rack tile, then restores the most recently removed pair.
- When all four rack slots are occupied without a pending match, choose **Revive** to return the rack tiles to the board and reshuffle for free while keeping your score, or **Reset Level** to restart the current level.
- Clearing the board advances the saved level number.

## Level progression

Level 1 starts with 24 tiles. Each level adds 8 tiles, reaching the full 144-tile board at level 16. Boards grow from the center into staggered, overlapping stacks from the first level, with up to four layers. Each upper tile is placed after its supporting tiles.

Up to one fifth of the board starts face down, selected from blocked tiles. Click a free purple-backed tile to turn it over with a flip animation, then click again to collect it. Tiles never reveal automatically, and blocked tiles cannot be flipped. Revealed tiles stay face up when undo restores a covering tile; shuffle preserves each tile's current face-up or face-down state. Hints only match revealed tiles.

Themed pairs unlock at levels 3 (toys), 5 (pets), 7 (food), 9 (Christmas), and 11 (nature). Each unlock includes the new theme, alongside previously unlocked themes. The themed share grows from one pair at level 3 to at most one quarter of the board. Each theme currently uses eight curated illustrations from its sheet.

Saved levels are preserved. Restarting a level uses that level's tile count and unlocked themes. If a themed image cannot load, its pairs fall back to classic tiles.

## Validation

Run `node tests/level-progression.cjs` to check level sizes, pair balance, theme unlocks, texture switching, and missing-image fallback.
