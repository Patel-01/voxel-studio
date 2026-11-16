"""Render one job with ManimGX.

    python render_job.py params.json preview out.png
    python render_job.py params.json video   out.mp4
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import manimgx as m
import numpy as np
from manimgx.rendering.film import Cut
from PIL import Image

from world import WorldParams, build_mesh

SKY = "#1b2233"


def make_scene(params: WorldParams, animate: bool) -> m.ThreeDScene:
    class Island(m.ThreeDScene):
        def construct(self) -> None:
            vertices, triangles, colors = build_mesh(params)
            island = m.MeshMobject(vertices, triangles, vertex_colors=colors)
            self.set_camera_orientation(phi=62 * m.DEGREES, theta=-50 * m.DEGREES, zoom=0.85)
            if not animate:
                self.add(island)
                self.wait(0.1)
                return
            self.play(m.Create(island), run_time=2.5)
            self.begin_ambient_camera_rotation(rate=m.TAU / params.orbit_seconds)
            self.wait(params.orbit_seconds)
            self.stop_ambient_camera_rotation()

    return Island()


def main() -> None:
    params_path, mode, out = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    params = WorldParams.from_dict(json.loads(Path(params_path).read_text()))
    m.config.background_color = SKY
    out.parent.mkdir(parents=True, exist_ok=True)

    if mode == "preview":
        m.config.pixel_width, m.config.pixel_height, m.config.frame_rate = 960, 540, 30
        shot: dict[str, bytes] = {}

        def grab(frame) -> None:
            shot["rgba"] = frame.pixels()
            raise Cut

        make_scene(params, animate=False).render(frames=grab)
        w, h = m.config.pixel_width, m.config.pixel_height
        pixels = np.frombuffer(shot["rgba"], np.uint8).reshape(h, w, 4)
        Image.fromarray(pixels, "RGBA").convert("RGB").save(out)
    else:
        m.config.pixel_width, m.config.pixel_height, m.config.frame_rate = 1280, 720, 30
        film = make_scene(params, animate=True).render(str(out))
        print(f"frames={film.frame_count} fps={film.fps}")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
