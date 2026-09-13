# Pen logo assets

Two blue pen-style logos with transparent backgrounds. These are AI-generated
PNG images, not procedural Drawably components: they do not re-sketch, animate,
or respond to the library's colour options.

## Sheltie head

Left-facing Sheltie head with tipped ears and a smiling muzzle.

<img src="./sheltie-head-pen.png" alt="Blue hand-drawn Sheltie head" width="320">

[Download the Sheltie head](./sheltie-head-pen.png)

## Folder

A folder with a raised tab and a scribbled corner accent.

<img src="./folder-pen.png" alt="Blue hand-drawn folder" width="320">

[Download the folder](./folder-pen.png)

## Icon sizes

At tab-bar size the original strokes thin to a blot, so each logo also ships
at 128 px and 64 px with the stroke thickened before the downscale:
`folder-pen-128.png`, `folder-pen-64.png`, `sheltie-head-pen-128.png`,
`sheltie-head-pen-64.png`. Use the 128 px file for anything from 24 to 48 px
on screen and the 64 px file below that. `make-icons.py` regenerates them
from the originals with Pillow:

```sh
python3 assets/logos/make-icons.py assets/logos
```

To recolour a logo, use it as a CSS mask over a solid colour rather than
editing the PNG:

```css
.icon {
  width: 26px; height: 26px; background: currentColor;
  mask: url(sheltie-head-pen-128.png) center / contain no-repeat;
}
```

## Use in an application

Copy the desired PNG to your application's public assets directory and render
it as a standard image. For example, after copying to `public/images/`:

```html
<img src="/images/sheltie-head-pen.png" alt="Sheltie" width="96" height="96">
<img src="/images/folder-pen.png" alt="Folder" width="96" height="96">
```

Use `alt=""` when an image is decorative or accompanies an equivalent text
label. The blue strokes are best viewed against a light background. The
transparent regions can show the application's background through the artwork.

These assets are stored in the fork and are not included in the npm package.
