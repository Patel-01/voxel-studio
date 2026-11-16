"""Add the Kokoro voice-over and music to worldbrush.mp4 (run make_worldbrush.py first).

    .venv-tts\\Scripts\\python.exe video\\worldbrush_voice.py             # af_heart
    set VARIANT=links & .venv-tts\\Scripts\\python.exe video\\worldbrush_voice.py
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

from add_voice import trim

HERE = Path(__file__).parent
VARIANT = os.environ.get("VARIANT", "comment")
VIDEO = HERE / ("worldbrush.mp4" if VARIANT == "comment" else f"worldbrush_{VARIANT}.mp4")
TTS, BUILD = HERE / "tts", HERE / "build"
MUSIC = HERE / "music" / "bit_forest_intro.flac"
LENGTH = 38.0
LEAD, TAIL = 0.2, 0.15

# (scene start, scene end, line) — scenes match the captions in make_worldbrush.py.
SCRIPT = [
    (0.0, 3.0, "I paint a map, and the world builds itself."),
    (3.0, 5.3, "Grass raises land from the sea."),
    (5.3, 8.3, "Mountains climb to snowy peaks."),
    (8.3, 11.0, "Forests grow in,"),
    (11.0, 13.0, "and towns move in."),
    (13.0, 16.8, "Water carves a river, right through the hills."),
    (16.8, 22.3, "Then day turns to dusk, and at night, the lights come on."),
    (22.3, 28.5, "Or roll a brand new island, in one click."),
    (28.5, 32.5, "Claude Code built all of it, from one prompt."),
    (32.5, 38.0, "Want the code, and the prompt? Comment Claude, and I'll send it to you."),
]
if VARIANT == "links":
    SCRIPT[-1] = (32.5, 38.0, "Want the code, and the prompt? They're in the description, free to copy.")


def speak(kokoro: Kokoro, voice: str) -> Path:
    rate = 24000
    track = np.zeros(int(LENGTH * rate), dtype=np.float32)
    for start, end, line in SCRIPT:
        room = end - start - LEAD - TAIL
        speed = 1.0
        for _ in range(4):  # speed up only as much as needed to fit the scene
            samples, rate = kokoro.create(line, voice=voice, speed=speed, lang="en-us")
            samples = trim(samples, rate)
            seconds = len(samples) / rate
            if seconds <= room:
                break
            speed = min(1.3, speed * seconds / room * 1.03)
        first = int((start + LEAD) * rate)
        samples = samples[: len(track) - first]
        track[first: first + len(samples)] += samples
        flag = "  TOO LONG" if seconds > room else ""
        print(f"  {start:5.1f}s  {seconds:4.1f}s of {room:4.1f}s  speed {speed:.2f}  {line}{flag}")
    path = BUILD / f"wb_voice_{VARIANT}_{voice}.wav"
    sf.write(path, track, rate)
    return path


def mix(voice_wav: Path, voice: str) -> Path:
    out = HERE / (f"worldbrush_voice_{voice}.mp4" if VARIANT == "comment" else f"worldbrush_{VARIANT}_voice_{voice}.mp4")
    graph = (
        f"[1:a]aloop=loop=-1:size=2147483647,atrim=0:{LENGTH},asetpts=PTS-STARTPTS,"
        f"loudnorm=I=-24:TP=-3:LRA=11,afade=t=in:d=0.4,afade=t=out:st={LENGTH - 2.5}:d=2.5[music];"
        f"[2:a]aresample=44100,loudnorm=I=-16:TP=-2:LRA=7,aformat=channel_layouts=stereo,asplit[voice][key];"
        f"[music][key]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[ducked];"
        f"[ducked][voice]amix=inputs=2:normalize=0,volume=-1dB[a]"
    )
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(VIDEO), "-i", str(MUSIC), "-i", str(voice_wav),
         "-filter_complex", graph, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac",
         "-b:a", "192k", "-ar", "44100", "-t", str(LENGTH), "-movflags", "+faststart", str(out)],
        check=True,
    )
    return out


def main() -> None:
    voices = sys.argv[1:] or ["af_heart"]
    kokoro = Kokoro(str(TTS / "kokoro-v1.0.onnx"), str(TTS / "voices-v1.0.bin"))
    for voice in voices:
        print(voice)
        print("wrote", mix(speak(kokoro, voice), voice))


if __name__ == "__main__":
    main()
