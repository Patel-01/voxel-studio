"""Assemble the Glass Tower short from the recorded frames (video/frames/glass_main).

Record the frames first with glass_capture.js, then:

    .venv\\Scripts\\python.exe video\\make_glass.py            # Instagram ending: "Comment CLAUDE"
    set VARIANT=links & .venv\\Scripts\\python.exe video\\make_glass.py   # YouTube / X ending
"""

from __future__ import annotations

import os
from pathlib import Path

from make_video import BLACK, BOLD, BUILD, ENC, FPS, FRAMES, HERE, INK, SUN, Card, ff

VARIANT = os.environ.get("VARIANT", "comment")
OUT = HERE / ("glass.mp4" if VARIANT == "comment" else f"glass_{VARIANT}.mp4")
LENGTH = 38.0
RED = "#b9472f"
CYAN = "#1d7f8f"
AMBER = "#b8611a"


def save(card: Card, name: str) -> Path:
    path = BUILD / f"gl_{name}.png"
    card.img.save(path)
    return path


def caption(name: str, label: str, colour: str, text: str) -> Path:
    c = Card()
    c.text_block(70, [(label, BOLD(36), colour), (text, BLACK(58), INK)], width=900)
    return save(c, name)


def overlays() -> list[tuple[Path, float, float, bool]]:
    """(image, start, end, fade in): timing follows EVENTS in glass_capture.js."""
    c = Card()
    c.text_block(80, [("Meteors vs. a glass tower", BLACK(68), INK), ("Every pane shatters", BLACK(68), RED)], width=980, align="center")
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
        (hook, 0.0, 3.1, False),   # headline on the very first frame
        (caption("tap", "TAP ANYWHERE", RED, "A molten meteor flies to that spot"), 3.1, 6.2, True),
        (caption("slow", "SLOW-MO 0.2×", AMBER, "Watch every shard fly"), 6.2, 12.0, True),
        (caption("swarm", "STRESS TEST", RED, "50 meteors at once"), 12.0, 15.6, True),
        (caption("collapse", "STRUCTURAL COLLAPSE", CYAN, "Lose a floor and the glass above falls"), 15.6, 21.4, True),
        (caption("reset", "PRESS R", CYAN, "It puts itself back together"), 21.4, 25.0, True),
        (caption("size", "THE WHOLE THING", RED, "One 35 KB file. No libraries, raw WebGL2"), 25.0, 28.6, True),
        (built, 28.6, 32.5, True),
        (cta, 32.5, LENGTH, True),
    ]


def main() -> None:
    BUILD.mkdir(exist_ok=True)
    shots = overlays()
    inputs = ["-framerate", str(FPS), "-start_number", "0", "-i", str(FRAMES / "glass_main" / "%05d.jpg")]
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
    silent = BUILD / f"gl_{VARIANT}_video.mp4"
    ff(*inputs, "-filter_complex", ";".join(graph), "-map", "[v]", "-t", str(LENGTH), *ENC, str(silent))
    ff("-i", str(silent), "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-c:v", "copy", "-c:a", "aac",
       "-b:a", "96k", "-shortest", "-movflags", "+faststart", str(OUT))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
