"""Procedural voxel island: heightmap -> block grid -> culled triangle mesh."""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

AIR, STONE, SOIL, GRASS, SAND, WATER, SNOW, TRUNK, LEAVES = range(9)

# Original palette (RGB 0-1): a dusky, slightly teal-shifted island.
PALETTE = {
    STONE: (0.46, 0.47, 0.53),
    SOIL: (0.45, 0.31, 0.24),
    GRASS: (0.36, 0.66, 0.42),
    SAND: (0.90, 0.80, 0.58),
    WATER: (0.16, 0.52, 0.72),
    SNOW: (0.95, 0.97, 1.00),
    TRUNK: (0.36, 0.24, 0.20),
    LEAVES: (0.85, 0.42, 0.36),  # coral-red canopy
}
WATER_ALPHA = 1.0

# (neighbour offset, 4 corners counter-clockwise seen from outside, baked shade)
FACES = [
    ((1, 0, 0), [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)], 0.82),
    ((-1, 0, 0), [(0, 1, 0), (0, 0, 0), (0, 0, 1), (0, 1, 1)], 0.70),
    ((0, 1, 0), [(1, 1, 0), (0, 1, 0), (0, 1, 1), (1, 1, 1)], 0.62),
    ((0, -1, 0), [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)], 0.90),
    ((0, 0, 1), [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)], 1.00),
    ((0, 0, -1), [(0, 1, 0), (1, 1, 0), (1, 0, 0), (0, 0, 0)], 0.45),
]


@dataclass
class WorldParams:
    seed: int = 7
    size: int = 40          # blocks per side
    max_height: int = 14    # tallest column, in blocks
    roughness: float = 0.5  # 0 = rolling hills, 1 = jagged
    water_level: int = 4
    trees: int = 14
    orbit_seconds: float = 8.0

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "WorldParams":
        known = {k: data[k] for k in cls.__dataclass_fields__ if k in data}
        return cls(**known)


def heightmap(p: WorldParams) -> np.ndarray:
    rng = np.random.default_rng(p.seed)
    n = p.size
    total = np.zeros((n, n))
    amp, norm = 1.0, 0.0
    for octave in range(5):
        cells = 2 ** (octave + 1)
        grid = rng.random((cells + 1, cells + 1))
        t = np.linspace(0, cells, n, endpoint=False)
        i = t.astype(int)
        f = t - i
        f = f * f * (3 - 2 * f)  # smoothstep
        a = grid[np.ix_(i, i)]
        b = grid[np.ix_(i + 1, i)]
        c = grid[np.ix_(i, i + 1)]
        d = grid[np.ix_(i + 1, i + 1)]
        fx, fy = f[:, None], f[None, :]
        total += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy)
        norm += amp
        amp *= 0.25 + 0.6 * p.roughness
    total /= norm
    total = (total - total.min()) / max(float(np.ptp(total)), 1e-9)
    # Island falloff: sink the edges under the sea.
    axis = np.linspace(-1, 1, n)
    r = np.sqrt(axis[:, None] ** 2 + axis[None, :] ** 2)
    total *= np.clip(1.25 - r**2.2, 0, 1)
    return np.clip(np.rint(total * p.max_height), 1, p.max_height).astype(int)


def build_blocks(p: WorldParams) -> np.ndarray:
    h = heightmap(p)
    n = p.size
    depth = p.max_height + 8  # headroom for trees
    blocks = np.zeros((n, n, depth), dtype=np.uint8)
    z = np.arange(depth)[None, None, :]
    top = h[:, :, None]
    snow_line = max(p.water_level + 4, int(p.max_height * 0.8))

    blocks[z < top] = STONE
    blocks[(z < top) & (z >= top - 3)] = SOIL
    surface = z == top - 1
    blocks[surface & (top - 1 <= p.water_level)] = SAND
    blocks[surface & (top - 1 > p.water_level)] = GRASS
    blocks[surface & (top - 1 >= snow_line)] = SNOW
    blocks[(blocks == AIR) & (z <= p.water_level - 1)] = WATER

    rng = np.random.default_rng(p.seed + 1000)
    spots = np.argwhere((h - 1 > p.water_level) & (h - 1 < snow_line))
    spots = spots[(spots.min(axis=1) >= 2) & (spots.max(axis=1) < n - 2)]
    rng.shuffle(spots)
    for x, y in spots[: p.trees]:
        base = h[x, y]
        trunk = int(rng.integers(2, 5))
        crown = base + trunk
        leaves = blocks[x - 1 : x + 2, y - 1 : y + 2, crown - 1 : crown + 1]
        leaves[leaves == AIR] = LEAVES
        if blocks[x, y, crown + 1] == AIR:
            blocks[x, y, crown + 1] = LEAVES
        blocks[x, y, base:crown] = TRUNK
    return blocks


CABIN, ROOF, WINDOW = 9, 10, 11
PALETTE.update({CABIN: (0.66, 0.48, 0.32), ROOF: (0.30, 0.36, 0.52), WINDOW: (0.24, 0.30, 0.38)})
SNOW_COVERED = (GRASS, LEAVES, SAND, STONE, SOIL, ROOF)


def build_mesh(p: WorldParams, width: float = 8.0):
    """Return (vertices, triangles, vertex_colors) with hidden faces removed."""
    return mesh_from_blocks(build_blocks(p), p, width)


def mesh_from_blocks(blocks: np.ndarray, p: WorldParams, width: float = 8.0,
                     look: dict | None = None):
    """Mesh a block grid. `look` restyles colours only, so every look of the same
    grid has identical geometry and can be cross-faded.

    look keys: palette {block: rgb}, leaf_alt rgb, tint rgb, snow bool, window rgb.
    """
    look = look or {}
    colours = {**PALETTE, **look.get("palette", {})}
    tint = np.array(look.get("tint", (1, 1, 1)), dtype=float)
    padded = np.pad(blocks, 1, constant_values=AIR)
    core = padded[1:-1, 1:-1, 1:-1]
    solid = (core != AIR) & (core != WATER)
    water = core == WATER

    palette = np.zeros((12, 3))
    for block, rgb in colours.items():
        palette[block] = rgb

    verts, tris, cols = [], [], []
    count = 0
    for (dx, dy, dz), corners, shade in FACES:
        nb = padded[1 + dx : 1 + dx + core.shape[0], 1 + dy : 1 + dy + core.shape[1],
                    1 + dz : 1 + dz + core.shape[2]]
        visible = (solid & ((nb == AIR) | (nb == WATER))) | (water & (nb == AIR))
        if dz == -1:
            visible &= np.arange(core.shape[2])[None, None, :] > 0  # never seen from below
        cells = np.argwhere(visible)
        if not len(cells):
            continue
        quad = cells[:, None, :] + np.array(corners)[None, :, :]
        kinds = core[cells[:, 0], cells[:, 1], cells[:, 2]]
        # Per-block tint so flat areas don't look like one slab.
        jitter = ((cells @ np.array([73, 151, 283])) % 17) / 17.0 * 0.10 - 0.05
        base = palette[kinds]
        if "leaf_alt" in look:  # two-tone canopy
            mix = (((cells @ np.array([31, 57, 113])) % 11) / 10.0)[:, None]
            alt = base * (1 - mix) + np.array(look["leaf_alt"]) * mix
            base = np.where((kinds == LEAVES)[:, None], alt, base)
        if look.get("snow") and dz == 1:
            base = np.where(np.isin(kinds, SNOW_COVERED)[:, None], palette[SNOW], base)
        rgb = np.clip(base * shade * (1 + jitter[:, None]) * tint, 0, 1)
        if "window" in look:  # lit windows ignore shade and tint
            rgb = np.where((kinds == WINDOW)[:, None], np.array(look["window"]), rgb)
        alpha = np.where(kinds == WATER, WATER_ALPHA, 1.0)
        rgba = np.concatenate([rgb, alpha[:, None]], axis=1)
        idx = count + np.arange(len(cells))[:, None] * 4
        verts.append(quad.reshape(-1, 3))
        tris.append(np.concatenate([idx + [0, 1, 2], idx + [0, 2, 3]]))
        cols.append(np.repeat(rgba, 4, axis=0))
        count += len(cells) * 4

    vertices = np.concatenate(verts).astype(float)
    scale = width / p.size
    vertices[:, :2] -= p.size / 2
    vertices[:, 2] -= p.max_height / 2
    return vertices * scale, np.concatenate(tris), np.concatenate(cols)


def stats(p: WorldParams) -> dict:
    blocks = build_blocks(p)
    _, tris, _ = build_mesh(p)
    return {"blocks": int((blocks != AIR).sum()), "triangles": int(len(tris))}
