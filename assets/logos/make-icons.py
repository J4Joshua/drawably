"""Icon-size variants of the pen logos: the stroke is thickened before the
downscale, so it survives at 24 to 32 px instead of thinning to a blot."""
import sys
from pathlib import Path
from PIL import Image, ImageFilter

root = Path(sys.argv[1])
for name in ("folder-pen", "sheltie-head-pen"):
    im = Image.open(root / f"{name}.png").convert("RGBA")
    r, g, b, a = im.split()
    # dilate the alpha: every stroke grows by about 6 px on a 1254 px canvas,
    # which is one extra pen width once the image is 128 px wide
    fat = a.filter(ImageFilter.MaxFilter(13))
    # pad by 4% so the fattened stroke is not cut at the edge
    pad = int(im.width * 0.04)
    canvas = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    solid = Image.new("RGBA", im.size, (r.getpixel((0, 0)), 0, 0, 0))
    # paint the fattened alpha in the logo's own ink colour, sampled from the
    # darkest opaque pixel
    px = [im.getpixel((x, y)) for x in range(0, im.width, 40) for y in range(0, im.height, 40) if im.getpixel((x, y))[3] > 200]
    ink = min(px, key=lambda p: p[0] + p[1] + p[2])[:3]
    layer = Image.new("RGBA", im.size, ink + (0,))
    layer.putalpha(fat)
    canvas.paste(layer, (pad, pad), layer)
    for size in (128, 64):
        out = canvas.resize((size, size), Image.LANCZOS)
        out.save(root / f"{name}-{size}.png", optimize=True)
        print(name, size, (root / f"{name}-{size}.png").stat().st_size, "bytes")
