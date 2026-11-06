"""Draws PlayGan's icon set from one SVG design and writes the PNGs into app/assets.

The design (approved by the owner, 0.9.0): a play arrow built from six rainbow xylophone bars
with white "nails", on cream, and three small notes above its upper edge. Change it here and
re-run (`python3 app/assets/source/make-icons.py`; needs Playwright) — don't edit the PNGs.
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).resolve().parent.parent
CREAM = '#FFF8EC'
RAINBOW = ['#E5484D', '#F28C28', '#F5C518', '#3DB46D', '#2F8FE0', '#7B5CD6']
W, H = 600, 640                              # the arrow: width (left edge to tip) and height
# Centred in the square: the rounded tip ends short of X1, so the drawn arrow sits ~20 px left
# of its box; shift the box right so what is seen sits in the middle (a touch right of it, as
# play symbols are, so the heavy left edge does not pull it off-centre).
X0, X1, CY = 512 - W / 2 + 30, 512 + W / 2 + 30, 512
NOTES = [  # along the upper edge (0 = top-left corner, 1 = tip): position, gap above it, size, colour, tilt, kind (e = ♪, b = ♫)
    (0.47, 128, 34, '#2F8FE0', -10, 'e'),
    (0.70, 122, 32, '#E5484D', 8, 'b'),
    (0.92, 124, 30, '#3DB46D', 16, 'e'),
]


def note_xy(t, gap):
    """A point `gap` px above the arrow's upper edge, a fraction `t` of the way to the tip."""
    return X0 + t * W, CY - H / 2 + t * H / 2 - gap


def triangle_path(r=60):
    """Rounded play triangle: left edge at X0 (height H), tip at X1."""
    top, bot = CY - H / 2, CY + H / 2
    return (f'M{X0 + r} {top} Q{X0} {top - 6} {X0} {top + r} L{X0} {bot - r} Q{X0} {bot + 6} {X0 + r} {bot} '
            f'L{X1 - r * 0.9} {CY + r * 0.55} Q{X1} {CY} {X1 - r * 0.9} {CY - r * 0.55} Z')


def arrow(mono=None, n=6, gap=16):
    """The xylophone arrow: bars clipped to the triangle, a highlight on each, nails on the rails."""
    w = (X1 - X0 - gap * (n - 1)) / n
    out = [f'<defs><clipPath id="t"><path d="{triangle_path()}"/></clipPath></defs><g clip-path="url(#t)">']
    for i in range(n):
        x = X0 + i * (w + gap)
        out.append(f'<rect x="{x:.1f}" y="{CY - H / 2 - 10}" width="{w:.1f}" height="{H + 20}" rx="{w * 0.3:.1f}" fill="{mono or RAINBOW[i]}"/>')
        if not mono:
            out.append(f'<rect x="{x + w * 0.16:.1f}" y="{CY - H / 2}" width="{w * 0.16:.1f}" height="{H}" fill="#fff" opacity="0.22"/>')
    out.append('</g>')
    if not mono:
        for i in range(n - 1):
            x = X0 + i * (w + gap) + w / 2
            hh = H * (X1 - x) / (X1 - X0)
            for py in (CY - hh * 0.32, CY + hh * 0.32):
                out.append(f'<circle cx="{x:.1f}" cy="{py:.1f}" r="{w * 0.12:.1f}" fill="#fff" opacity="0.95"/>')
    return '\n'.join(out)


def note(x, y, s, color, rot, kind):
    """♪ or ♫ drawn from its head; (x, y) is roughly the note's middle."""
    hx, hy = round(x - s * 0.25), round(y + s * 0.95)
    if kind == 'e':
        body = ('<ellipse cx="0" cy="0" rx="50" ry="37" transform="rotate(-22)"/>'
                '<rect x="36" y="-200" width="16" height="200" rx="8"/>'
                '<path d="M44 -200 C 60 -150, 120 -140, 112 -80 C 108 -110, 80 -120, 52 -130 Z"/>')
    else:
        body = ('<ellipse cx="0" cy="0" rx="50" ry="37" transform="rotate(-22)"/>'
                '<ellipse cx="150" cy="-30" rx="50" ry="37" transform="rotate(-22 150 -30)"/>'
                '<rect x="36" y="-200" width="16" height="200" rx="8"/><rect x="186" y="-230" width="16" height="200" rx="8"/>'
                '<path d="M36 -200 L202 -236 L202 -196 L36 -160 Z"/>')
    return f'<g transform="translate({hx},{hy}) rotate({rot}) scale({s / 100})" fill="{color}">{body}</g>'


def logo(mono=None):
    return arrow(mono) + ''.join(note(*note_xy(t, gap), s, mono or c, r, k) for t, gap, s, c, r, k in NOTES)


def svg(size, body, bg=None, scale=1.0):
    """The 1024 design at `size` px; `scale` shrinks the drawing about the centre (Android's
    adaptive icons crop to the middle ~61%, so their foreground is drawn smaller)."""
    rect = f'<rect width="1024" height="1024" fill="{bg}"/>' if bg else ''
    g = f'<g transform="translate(512 512) scale({scale}) translate(-512 -512)">{body}</g>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 1024 1024">{rect}{g}</svg>'


FILES = {  # name: (pixels, svg, transparent background)
    'icon.png': (1024, svg(1024, logo(), CREAM), False),
    'favicon.png': (48, svg(48, logo(), CREAM), False),
    'android-icon-background.png': (512, svg(512, '', CREAM), False),
    'android-icon-foreground.png': (512, svg(512, logo(), scale=0.72), True),
    'android-icon-monochrome.png': (512, svg(512, logo(mono='#FFFFFF'), scale=0.72), True),
    'splash-icon.png': (1024, svg(1024, logo()), True),
}


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for name, (size, content, transparent) in FILES.items():
            page = await browser.new_page(viewport={'width': size, 'height': size})
            await page.set_content(f'<html><body style="margin:0;background:transparent">{content}</body></html>')
            await page.screenshot(path=str(OUT / name), omit_background=transparent, clip={'x': 0, 'y': 0, 'width': size, 'height': size})
            print('wrote', name)
        await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
