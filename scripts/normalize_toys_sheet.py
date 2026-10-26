"""Remove the toys sheet's right margin and normalize all 50 sprite cells."""
from normalize_pets_sheet import ROOT, normalize


if __name__ == "__main__":
    normalize(
        ROOT / "assets/images/themes/tile_spritesheet_toys.png",
        ROOT / "output/imagegen/toys-original.png",
        [0, 139, 278, 417, 557, 697, 835, 975, 1116, 1264, 1418],
        [0, 213, 426, 640, 852, 1060],
        (1484, 1060),
    )
