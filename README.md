# pi-bash-image

pi extension that lets bash return images inline.

Normally, seeing an image takes 2 calls:
1. `bash`
2. `read`

This adds a `__PI_IMAGE__` helper so bash can return the image in the same result.

It reuses pi’s public `read` tool for image handling, so image processing matches pi’s read behavior.

## Install

```bash
pi install npm:pi-bash-image
```

## Usage

```bash
# image in same result
agent-browser screenshot page.png && __PI_IMAGE__ page.png

# text + image together
agent-browser snapshot -i | __PI_IMAGE__ page.png

# multiple images
__PI_IMAGE__ before.png after.png
```

## How it works

- injects a `__PI_IMAGE__` shell helper into bash
- helper prints markers for image paths
- extension replaces those markers with the same content blocks pi `read` would return for that image
- all other bash behavior stays the same

## License

MIT
