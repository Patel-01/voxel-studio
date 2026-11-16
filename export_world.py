"""Export the generated island for the live web world.

Reuses the existing generator (world.py) and the film's cabin and season looks
(film.py), so the browser shows the same island as the renders.

    .venv\\Scripts\\python.exe export_world.py
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

from film import LOOKS, PARAMS, island_blocks
from world import LEAVES, PALETTE

OUT = Path(__file__).parent / "web" / "data" / "world.json"
SEASONS = ["Spring", "Summer", "Autumn", "Winter"]
KINDS = 12


def export() -> Path:
    blocks = island_blocks()  # (x, y, z) uint8, z up
    palettes, leaf_alt = [], []
    for name in SEASONS:
        look = LOOKS[name]
        colours = {**PALETTE, **look.get("palette", {})}
        palettes.append([list(colours.get(kind, (0, 0, 0))) for kind in range(KINDS)])
        leaf_alt.append(list(look.get("leaf_alt", colours[LEAVES])))
    data = {
        "seed": PARAMS.seed,
        "size": int(blocks.shape[0]),
        "depth": int(blocks.shape[2]),
        "waterLevel": PARAMS.water_level,
        "seasons": SEASONS,
        "palettes": palettes,   # [season][kind] -> sRGB 0-1
        "leafAlt": leaf_alt,    # [season] -> second canopy colour
        "blocks": base64.b64encode(blocks.tobytes()).decode("ascii"),  # index (x*size + y)*depth + z
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data))
    return OUT


if __name__ == "__main__":
    print("wrote", export())
