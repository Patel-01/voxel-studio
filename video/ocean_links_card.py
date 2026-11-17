"""Make the "links below" end card for the ocean reel (YouTube/X version).

Takes the last frame of the Instagram cut (which says Comment "CLAUDE"),
erases the text in the 16:9 band, and sets the links ending in its place.
Usage: python ocean_links_card.py <last_frame.png> <out.png>
"""
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

BAND = (656, 1264)          # the 16:9 picture band inside the 9:16 frame
TEXT = (650, 1230)          # rows that hold the old Comment / "CLAUDE" / body text
WHITE, YELLOW, BODY = (244, 250, 252), (255, 211, 77), (214, 230, 238)
FONT_BOLD = "C:/Windows/Fonts/segoeuib.ttf"
FONT_SEMI = "C:/Windows/Fonts/seguisb.ttf"


def erase_text(img: Image.Image) -> Image.Image:
    a = np.asarray(img).astype(np.float32)
    y0, y1 = BAND
    band = a[y0:y1].copy()
    lum = band.mean(axis=2)
    # text and its glow are much brighter/yellower than the soft water behind it
    row_med = np.median(lum, axis=1, keepdims=True)
    mask = (lum > row_med + 18) | (band[..., 0] > band[..., 2] + 10)
    m = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(15))
    mask = np.asarray(m) > 0
    # fill masked pixels with each row's median of unmasked pixels, then blur
    fill = band.copy()
    for r in range(band.shape[0]):
        ok = ~mask[r]
        if ok.any():
            fill[r, mask[r]] = np.median(band[r, ok], axis=0)
    soft = Image.fromarray(fill.astype(np.uint8)).filter(ImageFilter.GaussianBlur(28))
    soft = np.asarray(soft).astype(np.float32)
    # keep the original band where it is clean, use the soft fill where text was
    w = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10))) / 255.0
    w = np.clip(w * 1.6, 0, 1)[..., None]
    # rows that held text get a light overall soften so no ghost edges remain
    t0, t1 = TEXT[0] - y0, TEXT[1] - y0
    w[t0:t1] = np.maximum(w[t0:t1], 0.55)
    band = band * (1 - w) + soft * w
    a[y0:y1] = band
    noise = np.random.default_rng(7).normal(0, 1.2, a[y0:y1].shape)
    a[y0:y1] += noise
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def centered(d, y, text, font, fill, shadow=True):
    w = d.textlength(text, font=font)
    x = (1080 - w) / 2
    if shadow:
        d.text((x + 3, y + 4), text, font=font, fill=(10, 30, 45, 110))
    d.text((x, y), text, font=font, fill=fill)


def main(src: str, out: str) -> None:
    img = erase_text(Image.open(src).convert("RGB"))
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    centered(d, 655, "Links are", ImageFont.truetype(FONT_BOLD, 112), WHITE)
    centered(d, 790, "BELOW", ImageFont.truetype(FONT_BOLD, 170), YELLOW)
    body = ImageFont.truetype(FONT_SEMI, 52)
    centered(d, 1010, "The code, and all 7 prompts", body, BODY)
    centered(d, 1082, "it was built from, step by step.", body, BODY)
    shadowed = layer.filter(ImageFilter.GaussianBlur(0.6))
    img = Image.alpha_composite(img.convert("RGBA"), shadowed).convert("RGB")
    img.save(out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
