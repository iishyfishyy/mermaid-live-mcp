# mermaid-live-mcp

MCP server for generating [Mermaid](https://mermaid.js.org/) diagrams with live browser preview. Renders diagrams in real-time and supports SVG/PNG export.

<a href="https://npmjs.com/package/mermaid-live-mcp"><img src="https://img.shields.io/npm/v/mermaid-live-mcp" alt="npm version"></a>

## Install

### Claude Desktop

Add to your [Claude Desktop config](https://modelcontextprotocol.io/quickstart/user) (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "mermaid": {
      "command": "npx",
      "args": ["-y", "mermaid-live-mcp"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "mermaid": {
      "command": "npx",
      "args": ["-y", "mermaid-live-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add mermaid -- npx -y mermaid-live-mcp
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "mermaid": {
      "command": "npx",
      "args": ["-y", "mermaid-live-mcp"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `generate_mermaid` | Generate a diagram from Mermaid syntax and open a live preview in the browser |
| `update_diagram` | Replace a diagram's Mermaid syntax and re-render the live preview |
| `list_diagrams` | List all diagrams generated in the current session |
| `export_diagram` | Write a diagram's SVG to disk |

## How it works

When you ask your AI assistant to create a diagram, `mermaid-live-mcp` will:

1. Parse the Mermaid syntax
2. Open a browser tab with a live preview
3. Render the diagram as SVG in real-time via WebSocket
4. Provide download buttons for SVG and PNG export

Updates to a diagram are pushed instantly to the browser — no page refresh needed.

## Supported diagram types

All [Mermaid diagram types](https://mermaid.js.org/intro/) are supported, including:

- Flowcharts
- Sequence diagrams
- Class diagrams
- State diagrams
- Entity-relationship diagrams
- Gantt charts
- Pie charts
- Git graphs
- Mindmaps
- Timeline
- and more

## License

MIT
