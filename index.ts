/**
 * bash-commands — injects custom shell helpers into bash and processes their
 * output markers so rich content (images, etc.) comes back inline.
 *
 * Adding a new command:
 *   1. Define a BashCommand object (preamble, guideline, handle)
 *   2. Push it to the `commands` array
 *   That's it — the core loop handles the rest.
 *
 * Marker protocol: __PI_<NAME>_MARKER__:<payload>
 */

import {
  createBashTool,
  type ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import type { ImageContent } from "@mariozechner/pi-ai";
import { readFileSync } from "node:fs";
import { fileTypeFromBuffer } from "file-type";

const SUPPORTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

interface BashCommand {
  /** Uppercase name used in marker, e.g. "IMAGE" → __PI_IMAGE_MARKER__:payload */
  name: string;
  /** Shell function body injected into every bash invocation */
  preamble: string;
  /** Prompt guideline surfaced to the model */
  guideline: string;
  /** Process a marker payload → content block or error string */
  handle(payload: string): Promise<ImageContent | { error: string }>;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const imageCommand: BashCommand = {
  name: "IMAGE",
  preamble: [
    `__PI_IMAGE__() {`,
    `  if [ -p /dev/stdin ]; then cat; printf '\n'; fi`,
    `  for f in "$@"; do`,
    `    _pimg=$(realpath "$f" 2>/dev/null)`,
    `    if [ -n "$_pimg" ] && [ -f "$_pimg" ]; then`,
    `      echo "__PI_IMAGE_MARKER__:$_pimg"`,
    `    else`,
    `      echo "[__PI_IMAGE__: file not found: $f]" >&2`,
    `    fi`,
    `  done`,
    `}`,
  ].join("\n"),
  guideline:
    "The bash environment has a built-in `__PI_IMAGE__` helper. " +
    "Use it to compose with any CLI that produces images (screenshots, charts, diagrams, etc.) " +
    "and include the result directly in the tool response — no separate read call needed. " +
    "Append `&& __PI_IMAGE__ <path>` to your command. " +
    "Pipe text into it to keep both: `some-command | __PI_IMAGE__ <path>`. " +
    "Multiple files: `__PI_IMAGE__ a.png b.png`.",
  async handle(payload) {
    const data = readFileSync(payload);
    const fileType = await fileTypeFromBuffer(data);
    if (!fileType || !SUPPORTED_MIME_TYPES.has(fileType.mime)) {
      return { error: `not a supported image (png/jpg/gif/webp): ${payload}` };
    }
    return {
      type: "image",
      data: data.toString("base64"),
      mimeType: fileType.mime,
    };
  },
};

// Add new commands here:
const commands: BashCommand[] = [imageCommand];

// ---------------------------------------------------------------------------
// Build marker lookup: "__PI_IMAGE_MARKER__:" → imageCommand, etc.
// ---------------------------------------------------------------------------

const markerMap = new Map<string, BashCommand>();
for (const cmd of commands) {
  markerMap.set(`__PI_${cmd.name}_MARKER__:`, cmd);
}

function findMarker(line: string): { cmd: BashCommand; marker: string } | null {
  for (const [marker, cmd] of markerMap) {
    if (line.startsWith(marker)) return { cmd, marker };
  }
  return null;
}

async function processTextBlock(text: string): Promise<{
  content: ({ type: "text"; text: string } | ImageContent)[];
  foundMarkers: boolean;
}> {
  const lines = text.split("\n");
  const content: ({ type: "text"; text: string } | ImageContent)[] = [];
  const textLines: string[] = [];
  let foundMarkers = false;

  const flushText = () => {
    if (textLines.length === 0) return;
    content.push({ type: "text", text: textLines.join("\n") });
    textLines.length = 0;
  };

  for (const line of lines) {
    const match = findMarker(line);
    if (!match) {
      textLines.push(line);
      continue;
    }

    foundMarkers = true;
    flushText();

    const payload = line.slice(match.marker.length).trim();
    if (!payload) continue;

    try {
      const block = await match.cmd.handle(payload);
      if ("error" in block) {
        textLines.push(`[__PI_${match.cmd.name}__: ${block.error}]`);
      } else {
        content.push(block);
      }
    } catch (e: any) {
      textLines.push(`[__PI_${match.cmd.name}__: ${e.message}]`);
    }
  }

  flushText();
  return { content, foundMarkers };
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

const preamble = commands.map((c) => c.preamble).join("\n") + "\n";

export default function (pi: ExtensionAPI) {
  const bashTool = createBashTool(process.cwd(), {
    spawnHook: ({ command, cwd, env }) => ({
      command: preamble + command,
      cwd,
      env,
    }),
  });

  pi.registerTool({
    ...bashTool,
    promptGuidelines: commands.map((c) => c.guideline),

    async execute(toolCallId, params, signal, onUpdate, _ctx) {
      const result = await bashTool.execute(
        toolCallId,
        params,
        signal,
        onUpdate,
      );

      const newContent: ({ type: "text"; text: string } | ImageContent)[] = [];
      let foundMarkers = false;

      for (const block of result.content) {
        if (block.type !== "text") {
          newContent.push(block);
          continue;
        }

        const processed = await processTextBlock(block.text);
        foundMarkers ||= processed.foundMarkers;
        newContent.push(...processed.content);
      }

      if (!foundMarkers) return result;
      return { ...result, content: newContent };
    },
  });
}
