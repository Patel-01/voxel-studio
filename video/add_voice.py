"""Add a Kokoro voice-over (plus music and scene sounds) to built_with_claude.mp4.

Run add_audio.py first (it makes build/effects.wav), then:

    .venv-tts\\Scripts\\python.exe video\\add_voice.py                 # default voices and music
    .venv-tts\\Scripts\\python.exe video\\add_voice.py af_bella        # a specific Kokoro voice

Needs video/tts/kokoro-v1.0.onnx and voices-v1.0.bin.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = Path(__file__).parent
VARIANT = os.environ.get("VARIANT", "comment")   # "links" = ending for YouTube and X
VIDEO = HERE / ("built_with_claude.mp4" if VARIANT == "comment" else f"built_with_claude_{VARIANT}.mp4")
TTS = HERE / "tts"
BUILD = HERE / "build"
MUSIC = HERE / "music" / "midsummer.mp3"
LENGTH = 47.5
LEAD = 0.25   # pause after each scene change before the voice starts
TAIL = 0.2    # silence kept before the next scene

# (scene start, scene end, line)
SCRIPT = [
    (0.0, 3.5, "I built this game, without writing any code."),
    (3.5, 8.5, "It started with two GitHub links, and one question. Can we use both together?"),
    (8.5, 13.0, "Claude Code read both repos, and built an island generator."),
    (13.0, 19.0, "Then it made a short film, generated entirely by code."),
    (19.0, 26.0, "Next prompt: make the world alive. Day and night, weather, birds, and villagers."),
    (26.0, 36.0, "Then, a playable city builder. Roads, power, jobs, and happiness. And it saves your city."),
    (36.0, 41.5, "Not a mock-up. A real game, in your browser."),
    (41.5, 47.5, "Want the repo links, and the exact prompts? Comment Claude, and I'll send them to you."),
]
if VARIANT == "links":
    SCRIPT[-1] = (41.5, 47.5, "Want the repo links, and the exact prompts? They're in the description, free to copy.")


def trim(samples: np.ndarray, rate: int) -> np.ndarray:
    """Drop the silence Kokoro leaves at either end."""
    loud = np.flatnonzero(np.abs(samples) > 0.01)
    if loud.size == 0:
        return samples
    return samples[max(0, loud[0] - rate // 50): loud[-1] + rate // 10]


def speak(kokoro: Kokoro, voice: str) -> Path:
    track, rate = None, 24000
    for start, end, line in SCRIPT:
        room = end - start - LEAD - TAIL
        speed = 1.0
        for _ in range(4):  # speed up only as much as needed to fit the scene
            samples, rate = kokoro.create(line, voice=voice, speed=speed, lang="en-us")
            samples = trim(samples, rate)
            seconds = len(samples) / rate
            if seconds <= room:
                break
            speed = min(1.35, speed * seconds / room * 1.03)
        if track is None:
            track = np.zeros(int(LENGTH * rate), dtype=np.float32)
        first = int((start + LEAD) * rate)
        samples = samples[: len(track) - first]
        track[first: first + len(samples)] += samples
        print(f"  {start:5.1f}s  {seconds:4.1f}s of {room:4.1f}s  speed {speed:.2f}  {line}")
    path = BUILD / f"voice_{VARIANT}_{voice}.wav"
    sf.write(path, track, rate)
    return path


def mix(voice_wav: Path, voice: str) -> Path:
    out = HERE / (f"built_with_claude_voice_{voice}.mp4" if VARIANT == "comment" else f"built_with_claude_{VARIANT}_voice_{voice}.mp4")
    effects = BUILD / "effects.wav"
    # Music sits low and ducks further whenever the voice speaks.
    graph = (
        f"[1:a]aloop=loop=-1:size=2147483647,atrim=0:{LENGTH},asetpts=PTS-STARTPTS,"
        f"loudnorm=I=-24:TP=-3:LRA=11,afade=t=in:d=0.6,afade=t=out:st={LENGTH - 2.5}:d=2.5[music];"
        f"[2:a]aresample=44100,loudnorm=I=-16:TP=-2:LRA=7,aformat=channel_layouts=stereo,asplit[voice][key];"
        f"[music][key]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[ducked];"
        f"[3:a]aresample=44100,volume=0.5,pan=stereo|c0=c0|c1=c0[fx];"
        f"[ducked][voice][fx]amix=inputs=3:normalize=0,volume=-1dB[a]"
    )
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(VIDEO), "-i", str(MUSIC), "-i", str(voice_wav),
         "-i", str(effects), "-filter_complex", graph, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac",
         "-b:a", "192k", "-ar", "44100", "-t", str(LENGTH), "-movflags", "+faststart", str(out)],
        check=True,
    )
    return out


def main() -> None:
    voices = sys.argv[1:] or ["af_heart", "am_michael"]
    kokoro = Kokoro(str(TTS / "kokoro-v1.0.onnx"), str(TTS / "voices-v1.0.bin"))
    for voice in voices:
        print(voice)
        print("wrote", mix(speak(kokoro, voice), voice))


if __name__ == "__main__":
    main()
