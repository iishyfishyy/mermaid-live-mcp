import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PreviewServer } from "@sketchdraw/preview";

// ── In-memory diagram store ──
interface StoredDiagram {
  id: string;
  syntax: string;
  svg: string;
  createdAt: Date;
  filePath?: string;
  previewUrl?: string;
}

const diagrams = new Map<string, StoredDiagram>();
let nextId = 1;

function generateId(): string {
  return `diagram_${nextId++}`;
}

// ── Live preview (single shared server, one tab per diagram id) ──
let previewServer: { server: PreviewServer; url: string } | null = null;
const openedTabs = new Set<string>();
const pendingRenders = new Map<string, () => void>();

async function ensurePreviewServer(): Promise<{
  server: PreviewServer;
  url: string;
} | null> {
  if (previewServer) return previewServer;

  const preview = new PreviewServer();
  preview.onSvgRendered = (diagId: string, svg: string) => {
    const stored = diagrams.get(diagId);
    if (stored) stored.svg = svg;
    pendingRenders.get(diagId)?.();
    pendingRenders.delete(diagId);
  };

  try {
    const url = await preview.start();
    previewServer = { server: preview, url };
    return previewServer;
  } catch {
    return null;
  }
}

function tabUrl(baseUrl: string, id: string): string {
  return `${baseUrl}/?id=${encodeURIComponent(id)}`;
}

async function pushMermaidToPreview(
  id: string,
  syntax: string,
  title?: string
): Promise<string | null> {
  const entry = await ensurePreviewServer();
  if (!entry) return null;
  entry.server.updateMermaid(id, syntax, title);
  if (!openedTabs.has(id)) {
    openedTabs.add(id);
    entry.server.openBrowser(id);
  }
  return tabUrl(entry.url, id);
}

function waitForSvg(id: string, timeoutMs = 2500): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingRenders.delete(id);
      resolve();
    }, timeoutMs);
    pendingRenders.set(id, () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// ── MCP Server ──
const server = new McpServer({
  name: "mermaid-live-mcp",
  version: "0.1.0",
});

// ── Tool: generate_mermaid ──
server.tool(
  "generate_mermaid",
  "Generate a diagram from Mermaid.js syntax. Renders in live preview browser with SVG/PNG download options. Supports flowcharts, sequence diagrams, class diagrams, state diagrams, ER diagrams, Gantt charts, and more.",
  {
    syntax: z
      .string()
      .describe("Mermaid diagram syntax (e.g. 'graph TD; A-->B;')"),
    title: z
      .string()
      .optional()
      .describe("Optional title for the browser preview tab"),
  },
  async ({ syntax, title }) => {
    const id = generateId();
    diagrams.set(id, {
      id,
      syntax,
      svg: "",
      createdAt: new Date(),
    });

    const preview = await pushMermaidToPreview(id, syntax, title);
    const storedDiagram = diagrams.get(id);
    if (storedDiagram && preview) storedDiagram.previewUrl = preview;
    if (preview) await waitForSvg(id);

    const responseLines = [`Mermaid diagram sent to preview.`, `ID: ${id}`];
    if (preview) {
      responseLines.push(`Preview: ${preview}`);
      responseLines.push(
        `Use the download buttons in the browser to export as SVG or PNG.`
      );
    }

    return {
      content: [{ type: "text" as const, text: responseLines.join("\n") }],
    };
  }
);

// ── Tool: update_diagram ──
server.tool(
  "update_diagram",
  "Replace a diagram's Mermaid syntax and re-render it in the preview.",
  {
    diagram_id: z.string().describe("The ID of the diagram to update"),
    syntax: z
      .string()
      .describe("New Mermaid diagram syntax to replace the existing one"),
    title: z
      .string()
      .optional()
      .describe("Optional title for the browser preview tab"),
  },
  async ({ diagram_id, syntax, title }) => {
    const stored = diagrams.get(diagram_id);
    if (!stored) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Diagram not found: ${diagram_id}. Use list_diagrams to see available diagrams.`,
          },
        ],
        isError: true,
      };
    }

    stored.syntax = syntax;
    stored.svg = "";

    const preview = await pushMermaidToPreview(diagram_id, syntax, title);
    if (preview) await waitForSvg(diagram_id);

    const responseLines = [`Diagram ${diagram_id} updated successfully.`];
    if (preview) {
      responseLines.push(`Preview: ${preview}`);
    }

    return {
      content: [{ type: "text" as const, text: responseLines.join("\n") }],
    };
  }
);

// ── Tool: list_diagrams ──
server.tool(
  "list_diagrams",
  "List all diagrams generated in this session.",
  {},
  async () => {
    if (diagrams.size === 0) {
      return {
        content: [
          { type: "text" as const, text: "No diagrams generated yet." },
        ],
      };
    }

    const lines = Array.from(diagrams.values()).map((d) => {
      const firstLine = d.syntax.split("\n")[0].trim();
      const parts = [
        `ID: ${d.id}`,
        `Created: ${d.createdAt.toISOString()}`,
        `SVG available: ${d.svg ? "yes" : "no"}`,
        `Syntax: ${firstLine}`,
      ];
      if (d.previewUrl) {
        parts.push(`Preview: ${d.previewUrl}`);
      }
      if (d.filePath) {
        parts.push(`File: ${d.filePath}`);
      }
      return parts.join(" | ");
    });

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  }
);

// ── Tool: export_diagram ──
server.tool(
  "export_diagram",
  "Write a diagram's SVG to disk. PNG export is available via the browser download buttons.",
  {
    diagram_id: z.string().describe("The ID of the diagram to export"),
    path: z.string().describe("File path to save the SVG file"),
  },
  async ({ diagram_id, path: outputPath }) => {
    const stored = diagrams.get(diagram_id);
    if (!stored) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Diagram not found: ${diagram_id}. Use list_diagrams to see available diagrams.`,
          },
        ],
        isError: true,
      };
    }

    if (!stored.svg) {
      return {
        content: [
          {
            type: "text" as const,
            text: `SVG not yet available for ${diagram_id}. The browser may still be rendering — try again in a moment.`,
          },
        ],
        isError: true,
      };
    }

    const outPath = resolve(outputPath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, stored.svg, "utf-8");
    stored.filePath = outPath;

    return {
      content: [
        {
          type: "text" as const,
          text: `Exported SVG to: ${outPath}`,
        },
      ],
    };
  }
);

// ── Start server ──
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});

// ── Graceful shutdown ──
async function shutdownPreview(): Promise<void> {
  if (!previewServer) return;
  await previewServer.server.stop();
  previewServer = null;
  openedTabs.clear();
  pendingRenders.clear();
}

process.on("SIGINT", async () => {
  await shutdownPreview();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await shutdownPreview();
  process.exit(0);
});
