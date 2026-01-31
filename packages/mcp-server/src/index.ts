#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  generateDiagram,
  DiagramSchema,
  svgToPng,
} from "@sketchdraw/core";
import { PreviewServer } from "@sketchdraw/preview";

// ── In-memory diagram store ──
interface StoredDiagram {
  id: string;
  input: unknown;
  svg: string;
  createdAt: Date;
  filePath?: string;
}

const diagrams = new Map<string, StoredDiagram>();
let nextId = 1;

function generateId(): string {
  return `diagram_${nextId++}`;
}

// ── Live preview ──
let previewServer: PreviewServer | null = null;
let previewUrl: string | null = null;
let browserOpened = false;

async function pushToPreview(svg: string): Promise<string | null> {
  if (!previewServer) {
    previewServer = new PreviewServer();
    try {
      previewUrl = await previewServer.start();
    } catch {
      previewServer = null;
      return null;
    }
  }
  previewServer.updateDiagram(svg);
  if (!browserOpened) {
    previewServer.openBrowser();
    browserOpened = true;
  }
  return previewUrl;
}

// ── MCP Server ──
const server = new McpServer({
  name: "sketchdraw",
  version: "0.1.0",
});

// ── Tool: generate_diagram ──
server.tool(
  "generate_diagram",
  "Generate a hand-drawn style diagram from a semantic description. Supports flow diagrams (nodes, edges, groups) and sequence diagrams (participants, messages). Returns SVG and optionally saves to file.",
  {
    diagram: z
      .object({
        type: z.enum(["flow", "sequence"]),
        title: z.string().optional(),
        // Flow diagram fields
        nodes: z
          .array(
            z.object({
              id: z.string(),
              label: z.string(),
              shape: z
                .enum([
                  "rectangle",
                  "ellipse",
                  "diamond",
                  "cylinder",
                  "cloud",
                  "hexagon",
                  "parallelogram",
                ])
                .default("rectangle"),
              color: z.string().optional(),
              textColor: z.string().optional(),
            })
          )
          .optional(),
        edges: z
          .array(
            z.object({
              from: z.string(),
              to: z.string(),
              label: z.string().optional(),
              style: z.enum(["solid", "dashed", "dotted"]).default("solid"),
              direction: z
                .enum(["forward", "backward", "both", "none"])
                .default("forward"),
              color: z.string().optional(),
            })
          )
          .optional(),
        groups: z
          .array(
            z.object({
              id: z.string(),
              label: z.string().optional(),
              contains: z.array(z.string()),
              color: z.string().optional(),
            })
          )
          .optional(),
        // Sequence diagram fields
        participants: z
          .array(
            z.object({
              id: z.string(),
              label: z.string(),
              color: z.string().optional(),
            })
          )
          .optional(),
        messages: z
          .array(
            z.object({
              from: z.string(),
              to: z.string(),
              label: z.string(),
              style: z.enum(["solid", "dashed", "dotted"]).default("solid"),
              color: z.string().optional(),
            })
          )
          .optional(),
        // Common fields
        style: z
          .enum(["hand-drawn", "clean", "minimal"])
          .default("hand-drawn"),
        direction: z.enum(["TB", "LR", "BT", "RL"]).default("TB"),
      })
      .describe("The diagram definition"),
    output_path: z
      .string()
      .optional()
      .describe(
        "File path to save the SVG output. If not specified, SVG is returned in the response only."
      ),
  },
  async ({ diagram, output_path }) => {
    try {
      const result = await generateDiagram(diagram);
      const id = generateId();

      let filePath: string | undefined;
      if (output_path) {
        filePath = resolve(output_path);
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, result.svg, "utf-8");
      }

      diagrams.set(id, {
        id,
        input: diagram,
        svg: result.svg,
        createdAt: new Date(),
        filePath,
      });

      const preview = await pushToPreview(result.svg);

      const responseLines = [
        `Diagram generated successfully.`,
        `ID: ${id}`,
      ];
      if (filePath) {
        responseLines.push(`Saved to: ${filePath}`);
      }
      if (preview) {
        responseLines.push(`Preview: ${preview}`);
      }
      responseLines.push(
        `SVG size: ${result.svg.length} bytes`,
        ``,
        `SVG content:`,
        result.svg
      );

      return {
        content: [{ type: "text" as const, text: responseLines.join("\n") }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error generating diagram: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: export_diagram ──
server.tool(
  "export_diagram",
  "Export a previously generated diagram to SVG or PNG format.",
  {
    diagram_id: z.string().describe("The ID of the diagram to export"),
    format: z.enum(["svg", "png"]).default("svg").describe("Export format"),
    path: z.string().describe("File path to save the exported diagram"),
  },
  async ({ diagram_id, format, path: outputPath }) => {
    try {
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

      const outPath = resolve(outputPath);
      mkdirSync(dirname(outPath), { recursive: true });

      if (format === "png") {
        const png = svgToPng(stored.svg);
        writeFileSync(outPath, png);
      } else {
        writeFileSync(outPath, stored.svg, "utf-8");
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Exported ${format.toUpperCase()} to: ${outPath}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error exporting diagram: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
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
      const parts = [`ID: ${d.id}`, `Created: ${d.createdAt.toISOString()}`];
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

// ── Tool: update_diagram ──
server.tool(
  "update_diagram",
  "Update a previously generated diagram with changes and re-render it.",
  {
    diagram_id: z.string().describe("The ID of the diagram to update"),
    changes: z
      .record(z.unknown())
      .describe(
        "Partial diagram changes to merge with the existing diagram definition"
      ),
    output_path: z
      .string()
      .optional()
      .describe("File path to save the updated SVG"),
  },
  async ({ diagram_id, changes, output_path }) => {
    try {
      const stored = diagrams.get(diagram_id);
      if (!stored) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Diagram not found: ${diagram_id}`,
            },
          ],
          isError: true,
        };
      }

      // Merge changes into the existing input
      const updatedInput = {
        ...(stored.input as Record<string, unknown>),
        ...changes,
      };

      const result = await generateDiagram(updatedInput);

      let filePath: string | undefined;
      if (output_path) {
        filePath = resolve(output_path);
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, result.svg, "utf-8");
      } else if (stored.filePath) {
        filePath = stored.filePath;
        writeFileSync(filePath, result.svg, "utf-8");
      }

      stored.input = updatedInput;
      stored.svg = result.svg;
      if (filePath) {
        stored.filePath = filePath;
      }

      const preview = await pushToPreview(result.svg);

      const responseLines = [`Diagram ${diagram_id} updated successfully.`];
      if (filePath) {
        responseLines.push(`Saved to: ${filePath}`);
      }
      if (preview) {
        responseLines.push(`Preview: ${preview}`);
      }

      return {
        content: [{ type: "text" as const, text: responseLines.join("\n") }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error updating diagram: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
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
