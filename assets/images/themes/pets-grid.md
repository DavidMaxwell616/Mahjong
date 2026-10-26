The pets sheet was repacked with Pillow using scripts/normalize_pets_sheet.py after user approval for scripted editing.

Output: tile_spritesheet_pets.png, 980x700 pixels, exactly 10 columns and 5 rows of 98x140 cells. Each original tile was cropped using measured boundaries and resized to the uniform cell dimensions. The original artwork is backed up at output/imagegen/pets-original.png. GameScene's pets atlas coordinates now use the normalized grid.

Run `python scripts/normalize_pets_sheet.py` to reproduce and verify all 50 cells. Requires Pillow.
