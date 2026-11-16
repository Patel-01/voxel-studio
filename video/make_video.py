"""Assemble the vertical "how we built this with Claude" short.

Needs the captured frames in video/frames and ffmpeg on PATH.

    .venv\\Scripts\\python.exe video\\make_video.py
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
ROOT = HERE.parent
FRAMES, ASSETS, BUILD = HERE / "frames", HERE / "assets", HERE / "build"
# VARIANT=links makes the ending for platforms without DMs (YouTube, X): "links are below".
VARIANT = os.environ.get("VARIANT", "comment")
OUT = HERE / ("built_with_claude.mp4" if VARIANT == "comment" else f"built_with_claude_{VARIANT}.mp4")
W, H, FPS = 1080, 1920, 30

CREAM, INK, SUN, SOFT, WHITE = "#fbf6ea", "#23262b", "#f2b632", "#6a6f78", "#ffffff"
FONTS = Path("C:/Windows/Fonts")


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


BLACK = lambda s: font("seguibl.ttf", s)   # noqa: E731
BOLD = lambda s: font("segoeuib.ttf", s)   # noqa: E731
MONO = lambda s: font("consolab.ttf", s)   # noqa: E731


def wrap(draw: ImageDraw.ImageDraw, text: str, f, width: int) -> list[str]:
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=f) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    return lines + [line]


class Card:
    """A full-frame transparent overlay drawn in the game's board-token style."""

    def __init__(self, dim: float = 0.0) -> None:
        self.img = Image.new("RGBA", (W, H), (35, 38, 43, int(255 * dim)))
        self.d = ImageDraw.Draw(self.img)

    def box(self, x, y, w, h, fill=CREAM, radius=30, shadow=10):
        if shadow:
            self.d.rounded_rectangle((x + shadow, y + shadow, x + w + shadow, y + h + shadow), radius, fill=INK)
        self.d.rounded_rectangle((x, y, x + w, y + h), radius, fill=fill, outline=INK, width=6)

    def text_block(self, y, parts, pad=44, width=920, fill=CREAM, gap=14, align="left"):
        """parts: [(text, font, colour)]. Draws a card sized to its text; returns the y below it."""
        laid, height = [], pad
        for text, f, colour in parts:
            for line in wrap(self.d, text, f, width - 2 * pad):
                box = self.d.textbbox((0, 0), line, font=f)
                laid.append((line, f, colour, height - box[1], self.d.textlength(line, font=f)))
                height += (f.size * 1.16) + 0
            height += gap
        height += pad - gap
        x = (W - width) // 2
        self.box(x, y, width, int(height), fill=fill)
        for line, f, colour, ty, tw in laid:
            tx = x + pad if align == "left" else x + (width - tw) / 2
            self.d.text((tx, y + ty), line, font=f, fill=colour)
        return y + int(height)

    def pill(self, y, text, f, fill=CREAM, colour=INK, pad_x=38, pad_y=20, shadow=8):
        tw = self.d.textlength(text, font=f)
        w, h = int(tw + 2 * pad_x), int(f.size * 1.2 + 2 * pad_y)
        x = (W - w) // 2
        self.box(x, y, w, h, fill=fill, radius=h // 2, shadow=shadow)
        box = self.d.textbbox((0, 0), text, font=f)
        self.d.text((x + pad_x, y + (h - (box[3] - box[1])) / 2 - box[1]), text, font=f, fill=colour)
        return y + h

    def picture(self, y, path: Path, width=980):
        pic = Image.open(path).convert("RGB")
        pic = pic.resize((width - 24, int((width - 24) * pic.height / pic.width)), Image.LANCZOS)
        x = (W - width) // 2
        self.box(x, y, width, pic.height + 24, fill=INK, radius=22)
        self.img.paste(pic, (x + 12, y + 12))
        return y + pic.height + 24

    def footer(self):
        f = BOLD(30)
        text = "built with Claude Code"
        tw = self.d.textlength(text, font=f)
        self.d.rounded_rectangle(((W - tw) / 2 - 22, 1596, (W + tw) / 2 + 22, 1650), 27, fill=INK)
        self.d.text(((W - tw) / 2, 1602), text, font=f, fill=CREAM)

    def save(self, name: str) -> Path:
        self.footer()
        path = BUILD / f"{name}.png"
        self.img.save(path)
        return path


def step(number: int, headline: str, chips: str | None = None, dim: float = 0.0, top: int = 230) -> Card:
    c = Card(dim)
    c.text_block(top, [(f"STEP {number}", BOLD(38), "#b9472f"), (headline, BLACK(64), INK)])
    if chips:
        c.pill(1470, chips, BOLD(36))
    return c


def overlays() -> dict[str, Path]:
    out = {}

    c = Card()
    c.text_block(230, [("I built this game", BLACK(86), INK), ("without writing code.", BLACK(86), "#b9472f")], align="center")
    c.pill(1470, "Here's how it happened", BOLD(42), fill=SUN)
    out["hook"] = c.save("ov_hook")

    c = Card(0.5)
    y = c.text_block(430, [("IT STARTED WITH", BOLD(38), "#b9472f"), ("two GitHub links", BLACK(80), INK)])
    y = c.text_block(y + 44, [("github.com/academa-labs/manimgx", MONO(40), INK), ("a code-driven animation engine", BOLD(34), SOFT)])
    y = c.text_block(y + 28, [("github.com/ppmpreetham/BUI", MONO(40), INK), ("Blender's interface as a UI library", BOLD(34), SOFT)])
    c.text_block(y + 60, [("MY PROMPT", BOLD(34), INK), ("\u201ccan we use both together?\u201d", BLACK(62), INK)], fill=SUN)
    out["links"] = c.save("ov_links")

    c = step(1, "Claude Code read both repos and wired them together", dim=0.5, top=400)
    y = c.picture(810, ASSETS / "panel.png")
    c.text_block(y + 40, [("A voxel island generator with a Blender-style control panel", BOLD(44), INK)])
    out["step1"] = c.save("ov_step1")

    out["step2"] = step(2, "A short film, generated entirely by code", "seasons \u00b7 sky \u00b7 stars \u00b7 nothing drawn by hand").save("ov_step2")
    out["step3"] = step(3, "Next prompt: make the world alive", "day & night \u00b7 weather \u00b7 birds \u00b7 villagers").save("ov_step3")
    out["step4"] = step(4, "Then: a playable city builder", "roads \u00b7 power \u00b7 jobs \u00b7 happiness \u00b7 saves").save("ov_step4")

    c = Card(0.5)
    y = c.text_block(400, [("NOT A MOCK-UP", BOLD(38), "#b9472f"), ("A real game that runs in the browser", BLACK(64), INK)])
    y = c.picture(y + 60, ASSETS / "city_ui.jpg")
    c.text_block(y + 40, [("Place, move, rotate, remove. Refresh and your city is still there.", BOLD(42), INK)])
    out["ui"] = c.save("ov_ui")

    c = Card(0.55)
    y = c.text_block(500, [("Want the repo links and the exact prompts?", BLACK(70), INK)], align="center")
    if VARIANT == "links":
        y = c.pill(y + 90, "Links are below", BLACK(88), fill=SUN, pad_x=50, pad_y=34, shadow=12)
        c.text_block(y + 90, [("in the description, free to copy", BOLD(52), INK)], align="center")
    else:
        y = c.pill(y + 90, "Comment  CLAUDE", BLACK(88), fill=SUN, pad_x=50, pad_y=34, shadow=12)
        c.text_block(y + 90, [("and I'll send them to you", BOLD(52), INK)], align="center")
    out["cta"] = c.save("ov_cta")
    return out


def ff(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


ENC = ["-r", str(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-an"]
BLUR = "gblur=sigma=14"


def segment(name: str, inputs: list[str], background: str, overlay: Path, seconds: float, fade: bool = True) -> Path:
    """background: filter graph producing [bg] from input 0. The overlay fades in on top."""
    path = BUILD / f"{name}.mp4"
    appear = "fade=in:st=0.1:d=0.35:alpha=1" if fade else "null"
    graph = (f"{background};[1:v]format=rgba,{appear}[ov];"
             f"[bg][ov]overlay=0:0:format=auto,format=yuv420p[v]")
    ff(*inputs, "-loop", "1", "-t", f"{seconds}", "-i", str(overlay), "-filter_complex", graph,
       "-map", "[v]", "-t", f"{seconds}", *ENC, str(path))
    return path


def main() -> None:
    BUILD.mkdir(exist_ok=True)
    ov = overlays()

    def frames(shot):
        return ["-framerate", str(FPS), "-start_number", "0", "-i", str(FRAMES / shot / "%05d.jpg")]

    # City orbit played forward then backward, so it can run behind several cards.
    orbit = BUILD / "orbit_pp.mp4"
    ff(*frames("city_orbit"), "-filter_complex", "[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]", "-map", "[v]", *ENC, str(orbit))

    def orbit_at(start, seconds):
        return ["-ss", f"{start}", "-t", f"{seconds}", "-i", str(orbit)]

    film = ROOT / "out" / "a_year_on_a_small_island_720p.mp4"
    film_cut = BUILD / "film_cut.mp4"
    ff("-i", str(film), "-filter_complex",
       "[0:v]trim=4.2:5.7,setpts=PTS-STARTPTS[a];[0:v]trim=9:10.5,setpts=PTS-STARTPTS[b];"
       "[0:v]trim=13.5:15,setpts=PTS-STARTPTS[c];[0:v]trim=22:23.5,setpts=PTS-STARTPTS[d];[a][b][c][d]concat=n=4:v=1[v]",
       "-map", "[v]", *ENC, str(film_cut))
    film_bg = (f"[0:v]split[a][b];[a]scale=-2:{H},crop={W}:{H},gblur=sigma=22,eq=brightness=-0.1[back];"
               f"[b]scale={W}:-2[fg];[back][fg]overlay=0:(H-h)/2+40[bg]")

    plain, blurred = "[0:v]null[bg]", f"[0:v]{BLUR}[bg]"
    parts = [
        segment("s1_hook", orbit_at(0, 3.5), plain, ov["hook"], 3.5, fade=False),  # headline on the very first frame
        segment("s2_links", orbit_at(3.5, 5), blurred, ov["links"], 5),
        segment("s3_step1", orbit_at(8.5, 4.5), blurred, ov["step1"], 4.5),
        segment("s4_step2", ["-i", str(film_cut)], film_bg, ov["step2"], 6),
        segment("s5_step3", frames("world"), plain, ov["step3"], 7),   # ends at sunset, before the dark night frames
        segment("s6_step4", frames("city_build"), plain, ov["step4"], 10),
        segment("s7_ui", orbit_at(10.5, 5.5), blurred, ov["ui"], 5.5),
        segment("s8_cta", orbit_at(2, 6), blurred, ov["cta"], 6),
    ]
    listing = BUILD / "concat.txt"
    listing.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts))
    # Silent audio track so every platform accepts the file.
    ff("-f", "concat", "-safe", "0", "-i", str(listing), "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
       "-c:v", "copy", "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart", str(OUT))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
