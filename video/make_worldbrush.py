"""Assemble the Worldbrush short from the recorded frames (video/frames/wb_main).

Record the frames first with worldbrush_capture.js, then:

    .venv\\Scripts\\python.exe video\\make_worldbrush.py            # Instagram ending: "Comment CLAUDE"
    set VARIANT=links & .venv\\Scripts\\python.exe video\\make_worldbrush.py   # YouTube / X ending
"""

from __future__ import annotations

import os
from pathlib import Path

from make_video import BLACK, BOLD, BUILD, ENC, FPS, FRAMES, HERE, INK, SUN, Card, ff

VARIANT = os.environ.get("VARIANT", "comment")
OUT = HERE / ("worldbrush.mp4" if VARIANT == "comment" else f"worldbrush_{VARIANT}.mp4")
LENGTH = 38.0
RED = "#b9472f"


def caption(name: str, label: str, colour: str, text: str) -> Path:
    c = Card()
    c.text_block(70, [(label, BOLD(36), colour), (text, BLACK(60), INK)], width=900)
    return save(c, name)


def save(card: Card, name: str) -> Path:
    path = BUILD / f"wb_{name}.png"
    card.img.save(path)
    return path


def overlays() -> list[tuple[Path, float, float, bool]]:
    """(image, start, end, fade in) — the timing follows the strokes in worldbrush_capture.js."""
    c = Card()
    c.text_block(90, [("I paint a map.", BLACK(76), INK), ("The world builds itself.", BLACK(76), RED)], width=980, align="center")
    hook = save(c, "hook")

    c = Card()
    c.text_block(70, [("BUILT BY CLAUDE CODE", BOLD(36), RED), ("From one prompt. Runs in the browser, no install.", BLACK(56), INK)], width=900)
    built = save(c, "built")

    c = Card(0.55)
    y = c.text_block(470, [("Want the code and the prompt?", BLACK(76), INK)], align="center")
    if VARIANT == "links":
        y = c.pill(y + 90, "Links are below", BLACK(88), fill=SUN, pad_x=50, pad_y=34, shadow=12)
        c.text_block(y + 90, [("in the description, free to copy", BOLD(52), INK)], align="center")
    else:
        y = c.pill(y + 90, "Comment  CLAUDE", BLACK(88), fill=SUN, pad_x=50, pad_y=34, shadow=12)
        c.text_block(y + 90, [("and I'll send it to you", BOLD(52), INK)], align="center")
    cta = save(c, "cta_" + VARIANT)

    return [
        (hook, 0.0, 3.0, False),   # headline on the very first frame
        (caption("grass", "GRASS", "#3f8f2a", "Land rises out of the sea"), 3.0, 5.3, True),
        (caption("mountain", "MOUNTAINS", "#5b6470", "Peaks climb, snow on top"), 5.3, 8.3, True),
        (caption("forest", "FOREST", "#2f6f35", "Trees grow in"), 8.3, 11.0, True),
        (caption("town", "TOWNS", RED, "Houses move in"), 11.0, 13.0, True),
        (caption("water", "WATER", "#2f79bd", "Carve a river through the hills"), 13.0, 16.8, True),
        (caption("time", "DAY → DUSK → NIGHT", "#8a5a1c", "And the lights come on"), 16.8, 22.3, True),
        (caption("new", "ONE CLICK", RED, "Or roll a brand new island"), 22.3, 28.5, True),
        (built, 28.5, 32.5, True),
        (cta, 32.5, LENGTH, True),
    ]


def main() -> None:
    BUILD.mkdir(exist_ok=True)
    shots = overlays()
    inputs = ["-framerate", str(FPS), "-start_number", "0", "-i", str(FRAMES / "wb_main" / "%05d.jpg")]
    graph, last = [], "0:v"
    for k, (image, start, end, fade) in enumerate(shots, start=1):
        inputs += ["-loop", "1", "-framerate", str(FPS), "-t", str(LENGTH), "-i", str(image)]
        fades = [f"fade=in:st={start}:d=0.3:alpha=1"] if fade else []
        if end < LENGTH:
            fades.append(f"fade=out:st={end - 0.25}:d=0.25:alpha=1")
        graph.append(f"[{k}:v]format=rgba,{','.join(fades) or 'null'}[o{k}]")
        graph.append(f"[{last}][o{k}]overlay=0:0:enable='between(t,{start},{end})':format=auto[v{k}]")
        last = f"v{k}"
    graph.append(f"[{last}]format=yuv420p[v]")
    silent = BUILD / f"wb_{VARIANT}_video.mp4"
    ff(*inputs, "-filter_complex", ";".join(graph), "-map", "[v]", "-t", str(LENGTH), *ENC, str(silent))
    # Silent audio track so every platform accepts the file; worldbrush_voice.py replaces it.
    ff("-i", str(silent), "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-c:v", "copy", "-c:a", "aac",
       "-b:a", "96k", "-shortest", "-movflags", "+faststart", str(OUT))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
