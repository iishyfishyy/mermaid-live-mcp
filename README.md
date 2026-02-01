# sketchdraw

Hand-drawn style diagram generator. Describe diagrams in JSON or Mermaid syntax and get sketchy, hand-drawn SVG/PNG output with optional live browser preview.

## Quick start

### CLI

```bash
npx @sketchdraw/cli render diagram.json -o output.svg
```

Or pipe from stdin:

```bash
cat diagram.json | npx @sketchdraw/cli render -f png > output.png
```

### MCP server

Works with Claude Desktop, Cursor, and Claude Code. See [`packages/mcp-server`](packages/mcp-server) for setup instructions.

```bash
claude mcp add mermaid -- npx -y mermaid-live-mcp
```

## Example

```json
{
  "type": "flow",
  "title": "CI/CD Pipeline",
  "direction": "LR",
  "nodes": [
    { "id": "commit", "label": "Git Commit", "shape": "ellipse" },
    { "id": "build", "label": "Build", "shape": "rectangle" },
    { "id": "test", "label": "Run Tests", "shape": "rectangle" },
    { "id": "check", "label": "Tests Pass?", "shape": "diamond" },
    { "id": "deploy", "label": "Deploy", "shape": "hexagon" }
  ],
  "edges": [
    { "from": "commit", "to": "build", "label": "trigger" },
    { "from": "build", "to": "test" },
    { "from": "test", "to": "check" },
    { "from": "check", "to": "deploy", "label": "yes" }
  ]
}
```

## Packages

| Package | Description |
|---------|-------------|
| [`@sketchdraw/core`](packages/core) | Diagram parsing, layout, and SVG rendering |
| [`@sketchdraw/cli`](packages/cli) | Command-line interface |
| [`@sketchdraw/preview`](packages/preview) | Live browser preview via WebSocket |
| [`mermaid-live-mcp`](packages/mcp-server) | MCP server for AI assistants |
| [`@sketchdraw/website`](packages/website) | Documentation site |

## Diagram types

- Flow diagrams (nodes, edges, groups)
- Sequence diagrams (participants, messages)

## Node shapes

`rectangle` `ellipse` `diamond` `cylinder` `cloud` `hexagon` `parallelogram`

## Themes

| Theme | Style |
|-------|-------|
| `hand-drawn` | Sketchy strokes, jitter, cursive font |
| `clean` | Crisp lines, sans-serif |
| `minimal` | Thin strokes, minimal weight |

## Output formats

- **SVG** -- vector output (default)
- **PNG** -- raster export via resvg

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm dev        # watch all packages
```

## License

MIT
