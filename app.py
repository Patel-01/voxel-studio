"""Voxel Studio: a BUI (Blender-style) control panel that drives ManimGX renders.

    .venv\\Scripts\\python.exe app.py
"""

from __future__ import annotations

import json
import os
import random
import subprocess
import sys
from pathlib import Path

import blenderui.tksyntax as tk

from world import WorldParams

HERE = Path(__file__).parent
OUT = HERE / "out"
PARAMS_FILE = OUT / "params.json"
PREVIEW_FILE = OUT / "preview.png"

# (field, label, low, high, resolution)
SLIDERS = [
    ("seed", "Seed", 0, 999, 1),
    ("size", "World size", 16, 64, 1),
    ("max_height", "Peak height", 6, 24, 1),
    ("roughness", "Roughness", 0.0, 1.0, 0.05),
    ("water_level", "Sea level", 0, 10, 1),
    ("trees", "Trees", 0, 40, 1),
    ("orbit_seconds", "Orbit seconds", 4, 20, 1),
]


class Studio:
    def __init__(self) -> None:
        OUT.mkdir(exist_ok=True)
        self.root = tk.Tk()
        self.root.title("Voxel Studio")
        self.root.geometry("1250x600")
        self.job: subprocess.Popen | None = None
        self.job_mode = ""
        self.job_out: Path | None = None
        self.dirty = False
        self.pending = None
        self.image = None

        defaults = WorldParams()
        side = tk.Frame(self.root)
        side.pack(side=tk.LEFT, fill=tk.Y, padx=10, pady=10)
        tk.Label(side, text="World").pack(anchor="w")
        self.vars: dict[str, tk.Variable] = {}
        for field, label, low, high, step in SLIDERS:
            is_float = isinstance(step, float)
            var = (tk.DoubleVar if is_float else tk.IntVar)(value=getattr(defaults, field))
            self.vars[field] = var
            tk.Scale(side, label=label, from_=low, to=high, resolution=step, variable=var,
                     orient=tk.HORIZONTAL, length=230,
                     command=lambda _v, f=field: self.changed(f)).pack(fill=tk.X, pady=2)

        tk.Button(side, text="Random seed", command=self.random_seed).pack(fill=tk.X, pady=(12, 2))
        tk.Button(side, text="Refresh preview", command=self.preview).pack(fill=tk.X, pady=2)
        self.video_button = tk.Button(side, text="Render video (720p)", command=self.video)
        self.video_button.pack(fill=tk.X, pady=2)
        tk.Button(side, text="Open output folder", command=lambda: os.startfile(OUT)).pack(
            fill=tk.X, pady=2)

        main = tk.Frame(self.root)
        main.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 10), pady=10)
        self.view = tk.Label(main, text="Rendering first preview...")
        self.view.pack()
        self.status = tk.StringVar(value="")
        tk.Label(main, textvariable=self.status, anchor="w").pack(fill=tk.X, pady=(6, 0))

        self.root.after(100, self.preview)
        self.root.after(150, self.poll)

    def params(self) -> WorldParams:
        return WorldParams.from_dict({k: v.get() for k, v in self.vars.items()})

    def changed(self, field: str) -> None:
        if field == "orbit_seconds":  # only affects the video
            return
        if self.pending is not None:
            self.root.after_cancel(self.pending)
        self.pending = self.root.after(350, self.preview)

    def random_seed(self) -> None:
        self.vars["seed"].set(random.randint(0, 999))
        self.preview()

    def start(self, mode: str, out: Path) -> None:
        PARAMS_FILE.write_text(json.dumps(self.params().to_dict()))
        flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        self.job = subprocess.Popen(
            [sys.executable, str(HERE / "render_job.py"), str(PARAMS_FILE), mode, str(out)],
            cwd=HERE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            creationflags=flags)
        self.job_mode, self.job_out = mode, out
        self.status.set("Rendering preview..." if mode == "preview"
                        else f"Rendering video to {out.name}...")

    def preview(self) -> None:
        self.pending = None
        if self.job is not None:
            self.dirty = True  # re-run when the current job ends
            return
        self.start("preview", PREVIEW_FILE)

    def video(self) -> None:
        if self.job is not None:
            self.status.set("Busy: wait for the current render to finish.")
            return
        p = self.params()
        self.start("video", OUT / f"island_seed{p.seed}_{p.size}.mp4")

    def poll(self) -> None:
        self.root.after(150, self.poll)
        if self.job is None or self.job.poll() is None:
            return
        job, mode, out = self.job, self.job_mode, self.job_out
        self.job = None
        log = (job.stdout.read() if job.stdout else "").strip()
        if job.returncode != 0:
            self.status.set("Render failed: " + (log.splitlines()[-1] if log else "unknown error"))
            (OUT / "last_error.log").write_text(log)
        elif mode == "preview":
            self.image = tk.PhotoImage(file=str(out))
            self.view.configure(image=self.image, text="")
            p = self.params()
            self.status.set(f"Preview: seed {p.seed}, {p.size}x{p.size} blocks")
        else:
            self.status.set(f"Video saved: {out}")
            os.startfile(out)
        if self.dirty:
            self.dirty = False
            self.preview()

    def run(self) -> None:
        self.root.mainloop()


if __name__ == "__main__":
    Studio().run()
