import { describe, it, expect } from "vitest";
import { renderFlowDiagram, renderSequenceDiagram } from "../render/svg-renderer.js";
import type { LayoutResult, SequenceLayoutResult } from "../schema/types.js";

describe("Flow diagram renderer", () => {
  const simpleLayout: LayoutResult = {
    width: 300,
    height: 200,
    nodes: [
      {
        id: "a",
        x: 50,
        y: 50,
        width: 120,
        height: 60,
        label: "Node A",
        shape: "rectangle",
      },
    ],
    edges: [],
    groups: [],
  };

  it("produces valid SVG", () => {
    const svg = renderFlowDiagram(simpleLayout, "hand-drawn");
    expect(svg).toContain("<svg");
    expect(svg).toContain("xmlns=");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("Node A");
  });

  it("renders with different themes", () => {
    const handDrawn = renderFlowDiagram(simpleLayout, "hand-drawn");
    const clean = renderFlowDiagram(simpleLayout, "clean");
    const minimal = renderFlowDiagram(simpleLayout, "minimal");

    // Hand-drawn uses path elements (sketchy lines)
    expect(handDrawn).toContain("<path");
    // Clean/minimal use rect elements
    expect(clean).toContain("<rect");
    expect(minimal).toContain("<rect");
  });

  it("renders title when provided", () => {
    const svg = renderFlowDiagram(simpleLayout, "hand-drawn", "My Title");
    expect(svg).toContain("My Title");
    expect(svg).toContain('font-weight="bold"');
  });

  it("renders groups", () => {
    const layout: LayoutResult = {
      ...simpleLayout,
      groups: [
        { id: "g1", label: "Group One", x: 30, y: 30, width: 200, height: 150 },
      ],
    };
    const svg = renderFlowDiagram(layout, "hand-drawn");
    expect(svg).toContain("Group One");
    expect(svg).toContain('class="group"');
  });

  it("renders edges with labels", () => {
    const layout: LayoutResult = {
      width: 400,
      height: 300,
      nodes: [
        { id: "a", x: 50, y: 50, width: 120, height: 60, label: "A", shape: "rectangle" },
        { id: "b", x: 50, y: 180, width: 120, height: 60, label: "B", shape: "rectangle" },
      ],
      edges: [
        {
          from: "a",
          to: "b",
          label: "connects",
          style: "solid",
          direction: "forward",
          points: [
            { x: 110, y: 110 },
            { x: 110, y: 180 },
          ],
        },
      ],
      groups: [],
    };
    const svg = renderFlowDiagram(layout, "hand-drawn");
    expect(svg).toContain("connects");
    expect(svg).toContain('class="edge"');
  });

  it("renders all shape types", () => {
    const shapes = [
      "rectangle",
      "ellipse",
      "diamond",
      "cylinder",
      "cloud",
      "hexagon",
      "parallelogram",
    ] as const;

    const layout: LayoutResult = {
      width: 1000,
      height: 200,
      nodes: shapes.map((shape, i) => ({
        id: `s${i}`,
        x: i * 140,
        y: 50,
        width: 120,
        height: 60,
        label: shape,
        shape,
      })),
      edges: [],
      groups: [],
    };

    const svg = renderFlowDiagram(layout, "clean");
    expect(svg).toContain("<svg");
    // All labels should be present
    for (const shape of shapes) {
      expect(svg).toContain(shape);
    }
  });

  it("produces deterministic output", () => {
    const svg1 = renderFlowDiagram(simpleLayout, "hand-drawn");
    const svg2 = renderFlowDiagram(simpleLayout, "hand-drawn");
    expect(svg1).toBe(svg2);
  });
});

describe("Sequence diagram renderer", () => {
  const simpleSequence: SequenceLayoutResult = {
    width: 400,
    height: 300,
    participants: [
      { id: "a", label: "Client", x: 100, topY: 40, bottomY: 250, width: 100 },
      { id: "b", label: "Server", x: 300, topY: 40, bottomY: 250, width: 100 },
    ],
    messages: [
      { from: "a", to: "b", label: "request", y: 130, style: "solid", isSelfMessage: false },
      { from: "b", to: "a", label: "response", y: 180, style: "dashed", isSelfMessage: false },
    ],
  };

  it("produces valid SVG", () => {
    const svg = renderSequenceDiagram(simpleSequence, "hand-drawn");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("Client");
    expect(svg).toContain("Server");
    expect(svg).toContain("request");
    expect(svg).toContain("response");
  });

  it("renders lifelines", () => {
    const svg = renderSequenceDiagram(simpleSequence, "clean");
    // Lifelines should use dashed style
    expect(svg).toContain('stroke-dasharray="6,4"');
  });

  it("renders title", () => {
    const svg = renderSequenceDiagram(simpleSequence, "hand-drawn", "Auth Flow");
    expect(svg).toContain("Auth Flow");
  });

  it("produces deterministic output", () => {
    const svg1 = renderSequenceDiagram(simpleSequence, "hand-drawn");
    const svg2 = renderSequenceDiagram(simpleSequence, "hand-drawn");
    expect(svg1).toBe(svg2);
  });
});
