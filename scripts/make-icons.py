#!/usr/bin/env python3
"""Draws the app icon set: an open ledger book with a rising line, in the
app's deep green. Original artwork, generated here. Run: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw

OUT = "assets/images/"
GREEN = (15, 92, 77, 255)
MINT = (98, 213, 181, 255)
WHITE = (255, 255, 255, 255)
S = 1024

def glyph(draw, color, accent, scale=1.0):
    cx, cy = S / 2, S / 2
    u = S / 1024 * scale
    def p(x, y): return (cx + (x - 512) * u, cy + (y - 512) * u)
    # Two pages of an open book
    draw.polygon([p(512, 330), p(250, 280), p(250, 700), p(512, 760)], fill=color)
    draw.polygon([p(512, 330), p(774, 280), p(774, 700), p(512, 760)], fill=color)
    # Rising line across the pages
    pts = [p(310, 600), p(410, 520), p(490, 570), p(610, 440), p(700, 400)]
    draw.line(pts, fill=accent, width=int(34 * u), joint="curve")
    for q in (pts[0], pts[-1]):
        r = 22 * u
        draw.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=accent)

def save(img, name): img.save(OUT + name)

icon = Image.new("RGBA", (S, S), GREEN)
glyph(ImageDraw.Draw(icon), WHITE, MINT)
save(icon, "icon.png")

fg = Image.new("RGBA", (S, S), (0, 0, 0, 0))   # adaptive: keep art inside the 66% safe zone
glyph(ImageDraw.Draw(fg), WHITE, MINT, 0.62)
save(fg, "adaptive-foreground.png")

mono = Image.new("RGBA", (S, S), (0, 0, 0, 0))
glyph(ImageDraw.Draw(mono), (255, 255, 255, 255), (255, 255, 255, 255), 0.62)
save(mono, "adaptive-monochrome.png")

splash = Image.new("RGBA", (S, S), (0, 0, 0, 0))
glyph(ImageDraw.Draw(splash), WHITE, MINT, 0.8)
save(splash, "splash-icon.png")

note = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
d = ImageDraw.Draw(note)
d.polygon([(48, 28), (14, 22), (14, 72), (48, 78)], fill=WHITE)
d.polygon([(48, 28), (82, 22), (82, 72), (48, 78)], fill=WHITE)
save(note, "notification-icon.png")
print("icons written")
