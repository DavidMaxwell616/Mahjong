"""Repack the original pets artwork into exact 98x140 sprite cells."""
from pathlib import Path
import shutil

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "assets/images/themes/tile_spritesheet_pets.png"
ORIGINAL = ROOT / "output/imagegen/pets-original.png"

# Measured boundaries of the original generated sheet, excluding its left margin.
X = [5, 147, 288, 430, 573, 713, 854, 995, 1137, 1279, 1481]
Y = [0, 220, 434, 644, 848, 1062]
CELL = (98, 140)


def normalize(TARGET, ORIGINAL, X, Y, source_size):
    if not ORIGINAL.exists():
        ORIGINAL.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(TARGET, ORIGINAL)
    with Image.open(ORIGINAL) as original:
        assert original.size == source_size, "Unexpected source dimensions"
        source = original.convert("RGBA")
    sheet = Image.new("RGBA", (CELL[0] * 10, CELL[1] * 5))
    for row in range(5):
        for col in range(10):
            tile = source.crop((X[col], Y[row], X[col + 1], Y[row + 1]))
            tile = tile.resize(CELL, Image.Resampling.LANCZOS)
            sheet.paste(tile, (col * CELL[0], row * CELL[1]))
    sheet.save(TARGET)
    with Image.open(TARGET) as saved:
        assert saved.size == (980, 700)
        for row in range(5):
            for col in range(10):
                expected = source.crop((X[col], Y[row], X[col + 1], Y[row + 1]))
                expected = expected.resize(CELL, Image.Resampling.LANCZOS)
                cell = saved.crop((col * 98, row * 140, (col + 1) * 98, (row + 1) * 140))
                assert cell.tobytes() == expected.tobytes()
    print("Verified 50 cells, each 98x140, in a 980x700 sheet.")


if __name__ == "__main__":
    normalize(TARGET, ORIGINAL, X, Y, (1481, 1062))
