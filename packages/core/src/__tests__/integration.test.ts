import { describe, it, expect } from "vitest";
import { generateDiagram } from "../index.js";

describe("generateDiagram (integration)", () => {
  it("generates a flow diagram end-to-end", async () => {
    const result = await generateDiagram({
      type: "flow",
      title: "Test Flow",
      nodes: [
        { id: "a", label: "Start", shape: "ellipse" },
        { id: "b", label: "Process", shape: "rectangle" },
        { id: "c", label: "End", shape: "ellipse" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    });

    expect(result.svg).toContain("<svg");
    expect(result.svg).toContain("</svg>");
    expect(result.svg).toContain("Start");
    expect(result.svg).toContain("Process");
    expect(result.svg).toContain("End");
    expect(result.svg).toContain("Test Flow");
    expect(result.png).toBeUndefined();
  });

  it("generates a sequence diagram end-to-end", async () => {
    const result = await generateDiagram({
      type: "sequence",
      title: "Auth",
      participants: [
        { id: "browser", label: "Browser" },
        { id: "api", label: "API" },
      ],
      messages: [
        { from: "browser", to: "api", label: "POST /login" },
        { from: "api", to: "browser", label: "200 OK", style: "dashed" },
      ],
    });

    expect(result.svg).toContain("<svg");
    expect(result.svg).toContain("Browser");
    expect(result.svg).toContain("API");
    expect(result.svg).toContain("POST /login");
    expect(result.svg).toContain("200 OK");
  });

  it("generates PNG when requested", async () => {
    const result = await generateDiagram(
      {
        type: "flow",
        nodes: [{ id: "a", label: "A" }],
      },
      { png: true }
    );

    expect(result.svg).toContain("<svg");
    expect(result.png).toBeInstanceOf(Buffer);
    // PNG magic bytes
    expect(result.png![0]).toBe(0x89);
    expect(result.png![1]).toBe(0x50); // P
    expect(result.png![2]).toBe(0x4e); // N
    expect(result.png![3]).toBe(0x47); // G
  });

  it("rejects invalid input", async () => {
    await expect(
      generateDiagram({ type: "bogus" })
    ).rejects.toThrow();
  });

  it("handles various shape types in flow diagram", async () => {
    const result = await generateDiagram({
      type: "flow",
      nodes: [
        { id: "a", label: "Rect", shape: "rectangle" },
        { id: "b", label: "Ellipse", shape: "ellipse" },
        { id: "c", label: "Diamond", shape: "diamond" },
        { id: "d", label: "DB", shape: "cylinder" },
        { id: "e", label: "Cloud", shape: "cloud" },
        { id: "f", label: "Hex", shape: "hexagon" },
        { id: "g", label: "Para", shape: "parallelogram" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "d" },
        { from: "d", to: "e" },
        { from: "e", to: "f" },
        { from: "f", to: "g" },
      ],
      direction: "LR",
      style: "clean",
    });

    expect(result.svg).toContain("<svg");
    expect(result.svg).toContain("Rect");
    expect(result.svg).toContain("Cloud");
    expect(result.svg).toContain("Hex");
  });

  it("handles themes", async () => {
    for (const style of ["hand-drawn", "clean", "minimal"] as const) {
      const result = await generateDiagram({
        type: "flow",
        nodes: [{ id: "a", label: "A" }],
        style,
      });
      expect(result.svg).toContain("<svg");
    }
  });
});
