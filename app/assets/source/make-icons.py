import asyncio
from playwright.async_api import async_playwright

def note(fill, scale=1.0, cx=512, cy=512):
    # Beamed eighth notes, drawn on a 1024 grid centred near (512,512), then scaled about the centre.
    g = f'''
    <g transform="translate({cx},{cy}) scale({scale}) translate(-512,-512)" fill="{fill}">
      <ellipse cx="372" cy="712" rx="118" ry="86" transform="rotate(-22 372 712)"/>
      <ellipse cx="702" cy="642" rx="118" ry="86" transform="rotate(-22 702 642)"/>
      <rect x="440" y="300" width="50" height="420" rx="20"/>
      <rect x="770" y="230" width="50" height="420" rx="20"/>
      <path d="M440 312 Q440 296 456 292 L800 222 Q820 218 820 238 L820 312 Q820 328 804 332 L462 404 Q440 408 440 388 Z"/>
    </g>'''
    return g

def svg(size, body, bg=None):
    rect = ''
    if bg == 'gradient':
        rect = '''<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#EE7A52"/><stop offset="1" stop-color="#C9442E"/></linearGradient></defs>
          <rect width="1024" height="1024" fill="url(#g)"/>
          <circle cx="300" cy="296" r="54" fill="#FFD36B"/>'''
    elif bg:
        rect = f'<rect width="1024" height="1024" fill="{bg}"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 1024 1024">{rect}{body}</svg>'

jobs = {
    'icon.png': (1024, svg(1024, note('#FFFFFF', 0.82, 492, 512), 'gradient'), False),
    'android-icon-background.png': (512, svg(512, '', 'gradient'), False),
    'android-icon-foreground.png': (512, svg(512, note('#FFFFFF', 0.58, 498, 510)), True),
    'android-icon-monochrome.png': (512, svg(512, note('#FFFFFF', 0.58, 498, 510)), True),
    'splash-icon.png': (1024, svg(1024, note('#D9573B', 0.9, 490, 510)), True),
    'favicon.png': (48, svg(48, note('#FFFFFF', 0.82, 492, 512), 'gradient'), False),
}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, (size, s, transparent) in jobs.items():
            pg = await b.new_page(viewport={'width': size, 'height': size})
            await pg.set_content(f'<html><body style="margin:0;background:transparent">{s}</body></html>')
            await pg.screenshot(path=name, omit_background=transparent, clip={'x':0,'y':0,'width':size,'height':size})
        await b.close()
asyncio.run(main())
