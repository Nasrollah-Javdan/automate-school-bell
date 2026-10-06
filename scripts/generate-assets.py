#!/usr/bin/env python3
"""
Generates the static application assets:

  resources/icon.png      512x512 app / installer icon
  resources/tray.png      32x32 system tray icon
  resources/icon.ico      multi size Windows icon
  resources/fallback-bell.wav   optional synthesised bell, used only when
                                resources/school-bell.mp3 is missing

The shipped default bell tone is resources/school-bell.mp3, a real recording
that is kept in the repository. It is deliberately NOT regenerated, so running
this script can never change how the school bell sounds. The synthesised WAV
below is only a last-resort fallback for a repository without the MP3.

Everything is drawn/synthesised locally so the repository has no binary
downloads and the icons can be regenerated at any time:

    python3 scripts/generate-assets.py
"""

from __future__ import annotations

import math
import os
import struct
import wave

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "resources")

# Brand colours
BG_TOP = (99, 102, 241)     # indigo 500
BG_BOTTOM = (55, 48, 163)  # indigo 800
GRADIENT_MAX_ALPHA = 165
BELL = (255, 255, 255)
BELL_SHADE = (206, 216, 255)


def _lerp(a: tuple, b: tuple, t: float) -> tuple:
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def _rounded(draw: ImageDraw.ImageDraw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_icon(size: int, rounded: bool = True) -> Image.Image:
    """Bell glyph on a rounded indigo square."""
    ss = size * 4  # supersample for smooth edges
    img = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # background
    if rounded:
        _rounded(draw, (0, 0, ss - 1, ss - 1), int(ss * 0.22), BG_TOP)
        # vertical gradient overlay
        grad = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
        gdraw = ImageDraw.Draw(grad)
        for y in range(ss):
            t = y / ss
            colour = _lerp(BG_TOP, BG_BOTTOM, t) + (int(GRADIENT_MAX_ALPHA * t),)
            gdraw.line([(0, y), (ss, y)], fill=colour)
        mask = Image.new("L", (ss, ss), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, ss - 1, ss - 1), radius=int(ss * 0.22), fill=255)
        img.alpha_composite(Image.composite(grad, Image.new("RGBA", (ss, ss), (0, 0, 0, 0)), mask))
    else:
        draw.rectangle((0, 0, ss - 1, ss - 1), fill=BG_TOP)

    u = ss / 100.0  # unit
    cx = ss / 2

    # --- bell body -------------------------------------------------------
    top = 26 * u
    bottom = 68 * u
    half_top = 9.5 * u
    half_bottom = 21 * u

    body = []
    steps = 60
    for i in range(steps + 1):
        t = i / steps
        y = top + (bottom - top) * t
        # superellipse-ish profile: narrow at the top, flaring at the bottom
        width = half_top + (half_bottom - half_top) * (t ** 1.65)
        body.append((cx - width, y))
    for i in range(steps, -1, -1):
        t = i / steps
        y = top + (bottom - top) * t
        width = half_top + (half_bottom - half_top) * (t ** 1.65)
        body.append((cx + width, y))

    draw.polygon(body, fill=BELL)

    # dome cap
    draw.ellipse((cx - half_top, top - half_top * 0.92, cx + half_top, top + half_top * 0.92), fill=BELL)

    # base bar
    _rounded(draw, (cx - half_bottom - 2.2 * u, bottom - 3.4 * u, cx + half_bottom + 2.2 * u, bottom + 3.4 * u), 3.4 * u, BELL_SHADE)

    # clapper
    draw.ellipse((cx - 7.5 * u, bottom + 4.5 * u, cx + 7.5 * u, bottom + 19.5 * u), fill=BELL)

    # handle on top
    _rounded(draw, (cx - 2.6 * u, top - 11.5 * u, cx + 2.6 * u, top - 5.0 * u), 2.6 * u, BELL)

    return img.resize((size, size), Image.LANCZOS)


def draw_tray(size: int = 32) -> Image.Image:
    """Monochrome friendly bell for the Windows notification area."""
    ss = size * 8
    img = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    u = ss / 100.0
    cx = ss / 2

    top, bottom = 26 * u, 68 * u
    half_top, half_bottom = 9.5 * u, 21 * u

    body = []
    steps = 60
    for i in range(steps + 1):
        t = i / steps
        y = top + (bottom - top) * t
        w = half_top + (half_bottom - half_top) * (t ** 1.65)
        body.append((cx - w, y))
    for i in range(steps, -1, -1):
        t = i / steps
        y = top + (bottom - top) * t
        w = half_top + (half_bottom - half_top) * (t ** 1.65)
        body.append((cx + w, y))
    draw.polygon(body, fill=(255, 255, 255, 255))
    draw.ellipse((cx - half_top, top - half_top * 0.92, cx + half_top, top + half_top * 0.92), fill=(255, 255, 255, 255))
    _rounded(draw, (cx - half_bottom - 2.2 * u, bottom - 3.4 * u, cx + half_bottom + 2.2 * u, bottom + 3.4 * u), 3.4 * u, (255, 255, 255, 255))
    draw.ellipse((cx - 7.5 * u, bottom + 4.5 * u, cx + 7.5 * u, bottom + 19.5 * u), fill=(255, 255, 255, 255))
    _rounded(draw, (cx - 2.6 * u, top - 11.5 * u, cx + 2.6 * u, top - 5.0 * u), 2.6 * u, (255, 255, 255, 255))

    return img.resize((size, size), Image.LANCZOS)


def synth_bell(path: str, seconds: float = 3.0, rate: int = 44100) -> None:
    """
    A school bell tone: a fundamental plus inharmonic partials with
    independent decay times, which is what makes bells sound like bells.
    """
    n = int(seconds * rate)
    partials = [
        # (ratio, amplitude, decay seconds)
        (1.0, 1.00, 2.6),
        (2.02, 0.55, 1.9),
        (2.99, 0.34, 1.4),
        (4.07, 0.22, 1.0),
        (5.42, 0.14, 0.7),
        (6.79, 0.09, 0.5),
    ]
    base = 523.25  # C5
    attack = 0.006

    frames = bytearray()
    for i in range(n):
        t = i / rate
        env = 1.0
        sample = 0.0
        for ratio, amp, decay in partials:
            freq = base * ratio
            sample += amp * math.exp(-t / decay) * math.sin(2 * math.pi * freq * t)
        # soft attack avoids a click
        if t < attack:
            env = t / attack
        # gentle fade out at the very end
        tail = 1.0 if t < seconds - 0.25 else max(0.0, (seconds - t) / 0.25)
        value = sample * env * tail
        # keep some headroom and normalise
        value = math.tanh(value * 0.55)
        frames += struct.pack("<h", int(max(-1.0, min(1.0, value)) * 32000))

    with wave.open(path, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(bytes(frames))


def main() -> None:
    os.makedirs(RES, exist_ok=True)

    icon_512 = draw_icon(512)
    icon_512.save(os.path.join(RES, "icon.png"))
    print("wrote resources/icon.png (512x512)")

    sizes = [16, 24, 32, 48, 64, 128, 256]
    icon_512.save(
        os.path.join(RES, "icon.ico"),
        sizes=[(size, size) for size in sizes],
    )
    print(f"wrote resources/icon.ico ({', '.join(str(s) for s in sizes)})")

    draw_tray(32).save(os.path.join(RES, "tray.png"))
    print("wrote resources/tray.png (32x32)")

    draw_tray(64).save(os.path.join(RES, "tray@2x.png"))
    print("wrote resources/tray@2x.png (64x64)")

    # Only a fallback: the shipped default is the recorded MP3.
    synth_bell(os.path.join(RES, "fallback-bell.wav"))
    print("wrote resources/fallback-bell.wav (3s, fallback only)")


if __name__ == "__main__":
    main()