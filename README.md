# pi-bash-image

A [pi](https://github.com/badlogic/pi-mono) extension that lets the LLM include images directly in bash tool results — saving a full API round trip per screenshot.

## The Problem

With pi's default tools, viewing an image after a bash command takes two LLM calls:

1. `bash`: run command, take screenshot
2. `read`: load the screenshot into context

That's an extra network round trip every time the model needs to see what it did.

## The Fix

This extension overrides the bash tool to inject a `__PI_IMAGE__` shell function. The model appends it to any command, and the image comes back in the same tool result.

**One call. Text + images together.**

## Install

```bash
pi install npm:pi-bash-image
```

## Usage

The model automatically gets instructions via prompt guidelines. Examples of what it'll do:

```bash
# Screenshot in the same result
agent-browser screenshot page.png && __PI_IMAGE__ page.png

# Text output + image together
agent-browser snapshot -i | __PI_IMAGE__ page.png

# Multiple images
__PI_IMAGE__ before.png after.png
```

## How It Works

1. A `spawnHook` prepends the `__PI_IMAGE__` shell function to every bash command
2. The function passes through stdin (piped text) and prints a marker with the absolute file path
3. After bash executes, the extension scans stdout for markers, reads the files, detects mime type via magic bytes, and returns them as image content blocks alongside any text output

The override delegates to the real bash tool implementation — rendering, details, everything else is untouched.

## Extensible

The implementation uses a pluggable `BashCommand` interface. Adding new inline commands (not just images) is just defining a new object with a preamble, guideline, and handler — the core loop handles the rest.

## License

MIT
