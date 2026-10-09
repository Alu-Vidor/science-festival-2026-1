# Expedition frame

`expedition-frame.webp` is a generated game UI texture used by `robot-game.css` and `city-game.css`. Generated with the built-in imagegen tool, then resized to 1024 × 1024 and encoded as WebP (about 68 KiB). CSS uses a 10% nine-slice border so corners retain their proportions; the center is not painted over the interactive map.

Generation prompt:

> Use case: stylized-concept. Asset type: production game UI frame texture for a browser robot rescue game. Generate a square, straight-on, flat orthographic image, 1024x1024. A premium industrial expedition instrument frame: dark blue-green brushed gunmetal with warm aged brass thin bevels, finely engraved corner brackets, tiny restrained turquoise indicator insets and recessed screws. Frame occupies only the outer 9% on each side. The central 82% is a uniform solid dark navy (#122633) unobstructed empty square, no scene. Borders straight and perfectly axis aligned, corners equally sized for CSS nine-slice border-image. Hand-painted polished strategy videogame asset, tactile subtle material scratches, clean refined details, soft bevel highlights. No text, no numbers, no logos, no symbols, no perspective, no objects, no drop shadow outside frame. Edge-to-edge frame fills canvas.

## Robot valley

`robot-valley.png` is a new panoramic landscape generated with imagegen and copied unchanged. It supplies scenery only: open sage meadow, painted forest and rocks at the perimeter, and a glimpse of a lake. It contains no roads, labels, buildings or gameplay information. The roads, route overlays, signs and locations are separate SVG elements in `robot-map.js`; observations and scoring use only the engines. New location artwork and generation prompts are recorded in `robot/README.txt`.

Prompt: production hand-painted miniature strategy-game backdrop, wide 2.4:1 overhead orthographic forest valley, no horizon; warm upper-left light, low-contrast open meadow across the central 80%, detailed sage/olive trees, pale rocks and small wildflowers mostly in the outer 7%; turquoise lake only on the right perimeter. Match warm cream, terracotta and teal city-building sprites. No roads, paths, tracks, buildings, characters, robots, text, labels, grid or UI.
