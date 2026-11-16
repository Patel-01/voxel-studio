"""Add music and soft scene-change sounds to built_with_claude.mp4.

Makes one finished video per track found in video/music.

    .venv\\Scripts\\python.exe video\\add_audio.py
"""

from __future__ import annotations

import math
import struct
import subprocess
import wave
from pathlib import Path

HERE = Path(__file__).parent
VIDEO = HERE / "built_with_claude.mp4"
MUSIC = HERE / "music"
BUILD = HERE / "build"
RATE = 44100
LENGTH = 47.5
CUTS = [3.5, 8.5, 13.0, 19.0, 26.0, 36.0]   # scene changes: a soft pop each
CHIME_AT = 41.5                              # the "Comment CLAUDE" card: a three-note chime


def tone(samples: list[float], start: float, freq_from: float, freq_to: float, seconds: float, gain: float) -> None:
    """Mix a sine blip with a fast attack and exponential decay into the buffer."""
    first, count, phase = int(start * RATE), int(seconds * RATE), 0.0
    for i in range(count):
        t = i / count
        phase += 2 * math.pi * (freq_from + (freq_to - freq_from) * t) / RATE
        envelope = min(1.0, i / (0.004 * RATE)) * math.exp(-5.0 * t)
        if first + i < len(samples):
            samples[first + i] += math.sin(phase) * envelope * gain


def make_effects(path: Path) -> None:
    samples = [0.0] * int(LENGTH * RATE)
    for cut in CUTS:
        tone(samples, cut, 520, 880, 0.14, 0.32)          # rising "pop"
    for k, freq in enumerate([659.25, 783.99, 1046.5]):    # E5 G5 C6
        tone(samples, CHIME_AT + 0.05 + k * 0.11, freq, freq, 0.7, 0.3)
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767)) for s in samples))


def main() -> None:
    BUILD.mkdir(exist_ok=True)
    effects = BUILD / "effects.wav"
    make_effects(effects)
    tracks = sorted(p for p in MUSIC.iterdir() if p.suffix.lower() in {".mp3", ".flac", ".wav", ".ogg"})
    if not tracks:
        raise SystemExit(f"No music found in {MUSIC}")
    for track in tracks:
        out = HERE / f"built_with_claude_{track.stem}.mp4"
        # Loop the track if it is shorter than the video, level it for phones, fade both ends.
        graph = (
            f"[1:a]aloop=loop=-1:size=2147483647,atrim=0:{LENGTH},asetpts=PTS-STARTPTS,"
            f"loudnorm=I=-17:TP=-1.5:LRA=11,afade=t=in:d=0.6,afade=t=out:st={LENGTH - 2.5}:d=2.5[music];"
            f"[2:a]aresample={RATE},pan=stereo|c0=c0|c1=c0[fx];"
            f"[music][fx]amix=inputs=2:normalize=0,volume=-1.5dB[a]"
        )
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(VIDEO), "-i", str(track), "-i", str(effects),
             "-filter_complex", graph, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
             "-ar", str(RATE), "-t", str(LENGTH), "-movflags", "+faststart", str(out)],
            check=True,
        )
        print("wrote", out)


if __name__ == "__main__":
    main()
