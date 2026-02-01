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

// ── Live preview (per-diagram servers) ──
const previewServers = new Map<string, { server: PreviewServer; url: string }>();

async function ensurePreviewForDiagram(
  id: string
): Promise<{ server: PreviewServer; url: string } | null> {
  const existing = previewServers.get(id);
  if (existing) return existing;

  const preview = new PreviewServer();
  preview.onSvgRendered = (diagId: string, svg: string) => {
    const stored = diagrams.get(diagId);
    if (stored) stored.svg = svg;
  };

  try {
    const url = await preview.start();
    const entry = { server: preview, url };
    previewServers.set(id, entry);
    preview.openBrowser();
    return entry;
  } catch {
    return null;
  }
}

async function pushMermaidToPreview(
  id: string,
  syntax: string,
  title?: string
): Promise<string | null> {
  const entry = await ensurePreviewForDiagram(id);
  if (!entry) return null;
  entry.server.updateMermaid(id, syntax, title);
  return entry.url;
}

// ── MCP Server ──
const server = new McpServer({
  name: "sketchdraw",
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
async function shutdownAllPreviews(): Promise<void> {
  const stops = Array.from(previewServers.values()).map(({ server }) =>
    server.stop()
  );
  await Promise.allSettled(stops);
  previewServers.clear();
}

process.on("SIGINT", async () => {
  await shutdownAllPreviews();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await shutdownAllPreviews();
  process.exit(0);
});
