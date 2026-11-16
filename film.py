"""A Year on a Small Island: one generated island through four seasons and a day.

    .venv\\Scripts\\python.exe film.py            # 1080p film -> out/a_year_on_a_small_island.mp4
    .venv\\Scripts\\python.exe film.py draft      # 720p
    .venv\\Scripts\\python.exe film.py stills     # one PNG per season -> out/still_<season>.png
"""

from __future__ import annotations

import sys
from pathlib import Path

import manimgx as m
import numpy as np
from manimgx.rendering.film import Cut
from PIL import Image

from world import (AIR, CABIN, GRASS, LEAVES, ROOF, SAND, STONE, TRUNK, WATER, WINDOW,
                   WorldParams, build_blocks, heightmap, mesh_from_blocks)

OUT = Path(__file__).parent / "out"
PARAMS = WorldParams(seed=7, size=44, max_height=15, roughness=0.5, water_level=4, trees=16)
SKY_RADIUS = 60.0

# Each look: island colours + sky (zenith, horizon) + how visible the stars are.
LOOKS = {
    "Spring": {
        "caption": "Spring  ·  dawn",
        "palette": {GRASS: (0.52, 0.76, 0.44), LEAVES: (0.97, 0.66, 0.78)},
        "leaf_alt": (1.0, 0.90, 0.93), "tint": (1.0, 0.94, 0.93),
        "sky": ((0.30, 0.42, 0.70), (0.99, 0.74, 0.64)), "stars": 0.0,
    },
    "Summer": {
        "caption": "Summer  ·  noon",
        "palette": {GRASS: (0.30, 0.66, 0.34), LEAVES: (0.18, 0.50, 0.30)},
        "leaf_alt": (0.36, 0.64, 0.30), "tint": (1.0, 1.0, 1.0),
        "sky": ((0.20, 0.50, 0.90), (0.72, 0.88, 0.99)), "stars": 0.0,
    },
    "Autumn": {
        "caption": "Autumn  ·  dusk",
        "palette": {GRASS: (0.62, 0.58, 0.30), LEAVES: (0.86, 0.30, 0.18)},
        "leaf_alt": (0.98, 0.70, 0.22), "tint": (1.0, 0.86, 0.74),
        "sky": ((0.26, 0.20, 0.44), (0.99, 0.56, 0.30)), "stars": 0.15,
    },
    "Winter": {
        "caption": "Winter  ·  night",
        "palette": {GRASS: (0.70, 0.76, 0.80), LEAVES: (0.80, 0.85, 0.92),
                    WATER: (0.20, 0.36, 0.60), SAND: (0.80, 0.80, 0.80)},
        "tint": (0.66, 0.74, 0.98), "snow": True, "window": (1.0, 0.84, 0.36),
        "sky": ((0.02, 0.03, 0.09), (0.09, 0.13, 0.30)), "stars": 1.0,
    },
}


def island_blocks() -> np.ndarray:
    """The generated island plus a small cabin on the flattest free grass near the middle."""
    blocks = build_blocks(PARAMS)
    h = heightmap(PARAMS)
    n = PARAMS.size
    best, best_score = None, 1e9
    for x in range(3, n - 3):
        for y in range(3, n - 3):
            patch = h[x - 1 : x + 2, y - 1 : y + 2]
            if patch.min() - 1 <= PARAMS.water_level or np.ptp(patch) > 1:
                continue
            score = abs(x - n * 0.42) + abs(y - n * 0.42)
            if score < best_score:
                best, best_score = (x, y), score
    if best is None:
        return blocks
    x, y = best
    base = int(h[x - 1 : x + 2, y - 1 : y + 2].max())
    foot = (slice(x - 1, x + 2), slice(y - 1, y + 2))
    blocks[foot[0], foot[1], :base] = np.where(
        blocks[foot[0], foot[1], :base] == AIR, STONE, blocks[foot[0], foot[1], :base])
    blocks[x - 2 : x + 3, y - 2 : y + 3, base:] = AIR  # clear trees around the cabin
    blocks[foot[0], foot[1], base : base + 2] = CABIN
    blocks[foot[0], foot[1], base + 2] = ROOF
    blocks[x, y, base + 3] = ROOF
    for wx, wy in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        blocks[wx, wy, base + 1] = WINDOW
    return blocks


def sky_mesh(zenith, horizon, stars: float, seed: int = 3) -> tuple:
    """A big sphere seen from inside, with a vertical gradient and small star quads."""
    rows, cols = 24, 48
    lat = np.linspace(-np.pi / 2, np.pi / 2, rows + 1)
    lon = np.linspace(0, 2 * np.pi, cols + 1)
    la, lo = np.meshgrid(lat, lon, indexing="ij")
    pts = SKY_RADIUS * np.stack(
        [np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1).reshape(-1, 3)
    i, j = np.meshgrid(np.arange(rows), np.arange(cols), indexing="ij")
    a = (i * (cols + 1) + j).ravel()
    b, c, d = a + 1, a + cols + 2, a + cols + 1
    tris = np.concatenate([np.stack([a, c, b], 1), np.stack([a, d, c], 1),
                           np.stack([a, b, c], 1), np.stack([a, c, d], 1)])  # both windings

    def sky_colour(points: np.ndarray) -> np.ndarray:
        # The camera looks down, so the backdrop it sees is the lower half of the sphere.
        t = np.clip((points[:, 2] / SKY_RADIUS + 1.0) / 1.1, 0, 1)[:, None] ** 1.5
        return np.array(zenith) * (1 - t) + np.array(horizon) * t

    rng = np.random.default_rng(seed)
    count = 1400
    direction = rng.normal(size=(count, 3))
    direction /= np.linalg.norm(direction, axis=1, keepdims=True)
    centre = direction * SKY_RADIUS * 0.97
    up = np.cross(direction, [0.0, 0.0, 1.0])
    up /= np.linalg.norm(up, axis=1, keepdims=True) + 1e-9
    side = np.cross(direction, up)
    size = rng.uniform(0.07, 0.20, size=(count, 1))
    quad = np.stack([centre - up * size, centre + side * size, centre + up * size,
                     centre - side * size], axis=1).reshape(-1, 3)
    k = len(pts) + np.arange(count)[:, None] * 4
    star_tris = np.concatenate([k + [0, 1, 2], k + [0, 2, 3], k + [0, 2, 1], k + [0, 3, 2]])
    glow = np.repeat(rng.uniform(0.6, 1.0, size=(count, 1)), 4, axis=0) * stars
    star_rgb = sky_colour(quad) * (1 - glow) + np.array([1.0, 0.97, 0.88]) * glow

    vertices = np.concatenate([pts, quad])
    rgb = np.concatenate([sky_colour(pts), star_rgb])
    rgba = np.concatenate([rgb, np.ones((len(rgb), 1))], axis=1)
    return vertices, np.concatenate([tris, star_tris]), rgba


def meshes(name: str, blocks: np.ndarray) -> tuple[m.MeshMobject, m.MeshMobject]:
    look = LOOKS[name]
    v, t, c = mesh_from_blocks(blocks, PARAMS, width=8.0, look=look)
    island = m.MeshMobject(v, t, vertex_colors=c)
    sv, st, sc = sky_mesh(*look["sky"], look["stars"])
    return island, m.MeshMobject(sv, st, vertex_colors=sc)


def caption(text: str, size: int = 34) -> m.Text:
    return m.Text(text, font_size=size, color=m.WHITE).to_corner(m.DL, buff=0.6)


class Still(m.ThreeDScene):
    season = "Spring"

    def construct(self) -> None:
        island, sky = meshes(self.season, island_blocks())
        self.set_camera_orientation(phi=62 * m.DEGREES, theta=-50 * m.DEGREES, zoom=0.95)
        label = caption(LOOKS[self.season]["caption"])
        self.add_fixed_in_frame_mobjects(label)
        self.add(sky, island)
        self.wait(0.1)


class Year(m.ThreeDScene):
    def construct(self) -> None:
        blocks = island_blocks()
        island, sky = meshes("Spring", blocks)
        self.set_camera_orientation(phi=62 * m.DEGREES, theta=-50 * m.DEGREES, zoom=0.95)
        self.add(sky)

        title = m.Text("A Year on a Small Island", font_size=52, color=m.WHITE).to_edge(m.UP, buff=0.7)
        self.add_fixed_in_frame_mobjects(title)
        title.set_opacity(0)
        self.play(m.Create(island), title.animate.set_opacity(1), run_time=3.5)
        self.begin_ambient_camera_rotation(rate=m.TAU / 26)

        label = caption(LOOKS["Spring"]["caption"])
        self.add_fixed_in_frame_mobjects(label)
        label.set_opacity(0)
        self.play(label.animate.set_opacity(1), title.animate.set_opacity(0), run_time=1)
        self.wait(2)

        for name, fade, hold in (("Summer", 2.2, 2.3), ("Autumn", 2.2, 2.3),
                                 ("Winter", 2.8, 4.0), ("Spring", 2.8, 1.2)):
            next_island, next_sky = meshes(name, blocks)
            next_label = caption(LOOKS[name]["caption"])
            self.add_fixed_in_frame_mobjects(next_label)
            next_label.set_opacity(0)
            self.play(m.Transform(island, next_island), m.Transform(sky, next_sky),
                      label.animate.set_opacity(0), next_label.animate.set_opacity(1),
                      run_time=fade)
            self.remove(label)
            label = next_label
            self.wait(hold)

        end = m.Text("seed 7  ·  every block, season and star generated by code",
                     font_size=30, color=m.WHITE).to_edge(m.DOWN, buff=0.7)
        self.add_fixed_in_frame_mobjects(end)
        end.set_opacity(0)
        self.play(end.animate.set_opacity(1), label.animate.set_opacity(0), run_time=1.2)
        self.wait(2.3)
        self.stop_ambient_camera_rotation()


def render_stills() -> None:
    m.config.pixel_width, m.config.pixel_height, m.config.frame_rate = 960, 540, 30
    for name in LOOKS:
        shot: dict[str, bytes] = {}

        def grab(frame, shot=shot) -> None:
            shot["rgba"] = frame.pixels()
            raise Cut

        scene = Still()
        scene.season = name
        scene.render(frames=grab)
        pixels = np.frombuffer(shot["rgba"], np.uint8).reshape(540, 960, 4)
        path = OUT / f"still_{name.lower()}.png"
        Image.fromarray(pixels, "RGBA").convert("RGB").save(path)
        print("wrote", path)


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "film"
    OUT.mkdir(exist_ok=True)
    if mode == "stills":
        render_stills()
        return
    size = (1280, 720) if mode == "draft" else (1920, 1080)
    m.config.pixel_width, m.config.pixel_height, m.config.frame_rate = *size, 30
    name = "a_year_draft.mp4" if mode == "draft" else "a_year_on_a_small_island.mp4"
    film = Year().render(str(OUT / name), crf=18)
    print(f"wrote {OUT / name}: {film.frame_count / film.fps:.1f} s")


if __name__ == "__main__":
    main()
