"""Add the Kokoro voice-over, the engine's own glass sounds and music to glass.mp4 (run make_glass.py first).

The sound effects are re-synthesised here from the events glass_capture.js logged (frames/glass_main/00000.json),
using the same recipe as the Web Audio code in web/glass/index.html: high-passed noise bursts plus random
sine/triangle chimes for each shatter, a falling sine plus low noise for each impact.

    .venv-tts\\Scripts\\python.exe video\\glass_voice.py
    set VARIANT=links & .venv-tts\\Scripts\\python.exe video\\glass_voice.py
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

from add_voice import trim

HERE = Path(__file__).parent
VARIANT = os.environ.get("VARIANT", "comment")
VIDEO = HERE / ("glass.mp4" if VARIANT == "comment" else f"glass_{VARIANT}.mp4")
TTS, BUILD = HERE / "tts", HERE / "build"
EVENTS = HERE / "frames" / "glass_main" / "00000.json"
MUSIC = HERE / "music" / "midsummer.mp3"
LENGTH = 38.0
LEAD, TAIL = 0.2, 0.15
SR = 44100
SLOW = (7.1, 11.9)  # slow-mo window in the recording: sounds drop in pitch, as in the app

# (scene start, scene end, line): scenes match the captions in make_glass.py.
SCRIPT = [
    (0.0, 3.1, "Meteors, versus a glass tower."),
    (3.1, 6.2, "Tap anywhere, and a meteor flies right there."),
    (6.2, 12.0, "Slow it down, and watch every shard fly."),
    (12.0, 15.6, "Now, fifty meteors at once."),
    (15.6, 21.4, "When a floor loses most of its glass, the glass above it comes down."),
    (21.4, 25.0, "Press R, and it puts itself back together."),
    (25.0, 28.6, "The whole thing is one, thirty-five kilobyte file."),
    (28.6, 32.5, "Claude Code built all of it, from one prompt."),
    (32.5, 38.0, "Want the code, and the prompt? Comment Claude, and I'll send it to you."),
]
if VARIANT == "links":
    SCRIPT[-1] = (32.5, 38.0, "Want the code, and the prompt? They're in the description, free to copy.")

rng = np.random.default_rng(7)


def env(n: int, attack: float, decay: float) -> np.ndarray:
    t = np.arange(n) / SR
    return np.minimum(t / attack, 1.0) * np.exp(-t * 6.9 / decay)  # ~ -60 dB at `decay`


def lowpass(x: np.ndarray, f: float) -> np.ndarray:
    a = np.exp(-2 * np.pi * f / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):  # short buffers only
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def highpass(x: np.ndarray, f: float) -> np.ndarray:
    return x - lowpass(x, f)


def tone(f: float, dec: float, kind: str, sweep_to: float | None = None) -> np.ndarray:
    n = int((dec + 0.05) * SR)
    t = np.arange(n) / SR
    freq = f if sweep_to is None else f * (sweep_to / f) ** np.minimum(t / dec, 1)
    ph = 2 * np.pi * np.cumsum(np.full(n, freq) if np.isscalar(freq) else freq) / SR
    w = np.sin(ph) if kind == "sine" else (2 / np.pi) * np.arcsin(np.sin(ph)) if kind == "triangle" else 2 * ((ph / (2 * np.pi)) % 1) - 1
    return w * env(n, 0.003, dec)


def noise(dec: float) -> np.ndarray:
    n = int((dec + 0.05) * SR)
    return rng.uniform(-1, 1, n) * env(n, 0.004, dec)


def place(track: np.ndarray, t: float, x: np.ndarray, gain: float) -> None:
    i = int(t * SR)
    if i >= len(track):
        return
    x = x[: len(track) - i]
    track[i: i + len(x)] += x * gain


def sfx() -> Path:
    events = json.loads(EVENTS.read_text())
    track = np.zeros(int(LENGTH * SR), dtype=np.float64)
    last: dict[str, float] = {}
    gaps = {"sShatter": 0.06, "sTink": 0.07, "sBoom": 0.09, "sCreak": 0.3, "sWhoosh": 0.15, "sShimmer": 1.0}
    for t, name, k in events:
        if t - last.get(name, -9) < gaps.get(name, 0.1) or t >= LENGTH:
            continue
        last[name] = t
        r = 0.55 if SLOW[0] <= t <= SLOW[1] else 1.0
        if name == "sShatter":
            k = min(k, 1.3)
            place(track, t, highpass(noise(rng.uniform(.16, .32)), rng.uniform(2600, 4600) * r), .42 * k)
            place(track, t, lowpass(highpass(noise(.09), 900 * r), 1700 * r), .5 * k)
            for _ in range(rng.integers(4, 9)):
                place(track, t + rng.uniform(0, .07), tone(rng.uniform(1900, 7200) * r, rng.uniform(.3, 1.2), rng.choice(["sine", "triangle"])), rng.uniform(.025, .07) * k)
        elif name == "sBoom":
            k = min(k, 1.8)
            place(track, t, tone(95 * r, .9 + k * .35, "sine", 26 * r), .75 * k)
            place(track, t, lowpass(noise(1 + k * .4), 520 * r), 1.4 * k)
        elif name == "sTink":
            place(track, t, tone(rng.uniform(3200, 8200) * r, rng.uniform(.08, .25), "sine"), .018 * min(k / 5, 1.5))
        elif name == "sWhoosh":
            place(track, t, lowpass(noise(.8), 900), .35 * min(k, 1.6))
        elif name == "sCreak":
            place(track, t, tone(rng.uniform(48, 70) * r, .9, "saw", 30), .07)
            place(track, t, lowpass(noise(1.2), 260), .5)
        elif name == "sShimmer":
            for i in range(16):
                place(track, t + i * .085, tone(700 * 2 ** (i / 5), .9, "triangle" if i & 1 else "sine"), .04)
    # Same small room as the app: a 2.4 s decaying-noise reverb, mixed in at about a third.
    n = int(2.4 * SR)
    ir = rng.uniform(-1, 1, n) * (1 - np.arange(n) / n) ** 3.5
    size = 1 << int(np.ceil(np.log2(len(track) + n)))
    wet = np.fft.irfft(np.fft.rfft(track, size) * np.fft.rfft(ir, size), size)[: len(track)]
    wet *= np.abs(track).max() / (np.abs(wet).max() + 1e-9) * .5
    out = track + .32 * wet
    out /= np.abs(out).max() + 1e-9
    path = BUILD / "gl_sfx.wav"
    sf.write(path, np.stack([out, out], 1).astype(np.float32), SR)
    print(f"  sfx: {len(events)} logged sound calls")
    return path


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
    path = BUILD / f"gl_voice_{VARIANT}_{voice}.wav"
    sf.write(path, track, rate)
    return path


def mix(voice_wav: Path, sfx_wav: Path, voice: str) -> Path:
    out = HERE / (f"glass_voice_{voice}.mp4" if VARIANT == "comment" else f"glass_{VARIANT}_voice_{voice}.mp4")
    graph = (
        f"[1:a]aloop=loop=-1:size=2147483647,atrim=0:{LENGTH},asetpts=PTS-STARTPTS,"
        f"loudnorm=I=-27:TP=-3:LRA=11,afade=t=in:d=0.4,afade=t=out:st={LENGTH - 2.5}:d=2.5[music];"
        f"[3:a]loudnorm=I=-21:TP=-3:LRA=15,afade=t=out:st={LENGTH - 2}:d=2[fx];"
        f"[music][fx]amix=inputs=2:normalize=0[bed];"
        f"[2:a]aresample=44100,loudnorm=I=-16:TP=-2:LRA=7,aformat=channel_layouts=stereo,asplit[voice][key];"
        f"[bed][key]sidechaincompress=threshold=0.03:ratio=4:attack=20:release=300[ducked];"
        f"[ducked][voice]amix=inputs=2:normalize=0,volume=-1.5dB,alimiter=limit=0.6:level=false[a]"
    )
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(VIDEO), "-i", str(MUSIC), "-i", str(voice_wav),
         "-i", str(sfx_wav), "-filter_complex", graph, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac",
         "-b:a", "192k", "-ar", "44100", "-t", str(LENGTH), "-movflags", "+faststart", str(out)],
        check=True,
    )
    return out


def main() -> None:
    kokoro = Kokoro(str(TTS / "kokoro-v1.0.onnx"), str(TTS / "voices-v1.0.bin"))
    fx = sfx()
    print("wrote", mix(speak(kokoro, "af_heart"), fx, "af_heart"))


if __name__ == "__main__":
    main()
