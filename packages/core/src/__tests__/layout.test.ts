import { describe, it, expect } from "vitest";
import { layoutFlowDiagram } from "../layout/flow-layout.js";
import { layoutSequenceDiagram } from "../layout/sequence-layout.js";
import type { FlowDiagramDef, SequenceDiagramDef } from "../schema/types.js";

describe("Flow layout engine", () => {
  it("lays out a simple two-node flow diagram", async () => {
    const diagram: FlowDiagramDef = {
      type: "flow",
      nodes: [
        { id: "a", label: "Node A", shape: "rectangle" },
        { id: "b", label: "Node B", shape: "rectangle" },
      ],
      edges: [{ from: "a", to: "b", style: "solid", direction: "forward" }],
      groups: [],
      style: "hand-drawn",
      direction: "TB",
    };

    const result = await layoutFlowDiagram(diagram);

    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);

    // Nodes should have positions
    for (const node of result.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
    }

    // In TB direction, first node should be above second
    const nodeA = result.nodes.find((n) => n.id === "a")!;
    const nodeB = result.nodes.find((n) => n.id === "b")!;
    expect(nodeA.y).toBeLessThan(nodeB.y);

    // Edge should have route points
    expect(result.edges[0].points.length).toBeGreaterThanOrEqual(2);
  });

  it("handles groups", async () => {
    const diagram: FlowDiagramDef = {
      type: "flow",
      nodes: [
        { id: "a", label: "A", shape: "rectangle" },
        { id: "b", label: "B", shape: "rectangle" },
        { id: "c", label: "C", shape: "rectangle" },
      ],
      edges: [
        { from: "a", to: "b", style: "solid", direction: "forward" },
        { from: "b", to: "c", style: "solid", direction: "forward" },
      ],
      groups: [{ id: "g1", label: "Group 1", contains: ["a", "b"] }],
      style: "hand-drawn",
      direction: "TB",
    };

    const result = await layoutFlowDiagram(diagram);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].width).toBeGreaterThan(0);
    expect(result.groups[0].height).toBeGreaterThan(0);
  });

  it("handles LR direction", async () => {
    const diagram: FlowDiagramDef = {
      type: "flow",
      nodes: [
        { id: "a", label: "A", shape: "rectangle" },
        { id: "b", label: "B", shape: "rectangle" },
      ],
      edges: [{ from: "a", to: "b", style: "solid", direction: "forward" }],
      groups: [],
      style: "hand-drawn",
      direction: "LR",
    };

    const result = await layoutFlowDiagram(diagram);
    const nodeA = result.nodes.find((n) => n.id === "a")!;
    const nodeB = result.nodes.find((n) => n.id === "b")!;
    expect(nodeA.x).toBeLessThan(nodeB.x);
  });

  it("handles empty edges", async () => {
    const diagram: FlowDiagramDef = {
      type: "flow",
      nodes: [{ id: "a", label: "A", shape: "rectangle" }],
      edges: [],
      groups: [],
      style: "hand-drawn",
      direction: "TB",
    };

    const result = await layoutFlowDiagram(diagram);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
  });
});

describe("Sequence layout engine", () => {
  it("lays out a basic sequence diagram", () => {
    const diagram: SequenceDiagramDef = {
      type: "sequence",
      participants: [
        { id: "a", label: "Client" },
        { id: "b", label: "Server" },
      ],
      messages: [
        { from: "a", to: "b", label: "request", style: "solid" },
        { from: "b", to: "a", label: "response", style: "dashed" },
      ],
      style: "hand-drawn",
    };

    const result = layoutSequenceDiagram(diagram);

    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.participants).toHaveLength(2);
    expect(result.messages).toHaveLength(2);

    // Participants should be left-to-right
    expect(result.participants[0].x).toBeLessThan(result.participants[1].x);

    // Messages should be top-to-bottom
    expect(result.messages[0].y).toBeLessThan(result.messages[1].y);
  });

  it("handles self-messages", () => {
    const diagram: SequenceDiagramDef = {
      type: "sequence",
      participants: [{ id: "a", label: "Service" }],
      messages: [{ from: "a", to: "a", label: "self-call", style: "solid" }],
      style: "hand-drawn",
    };

    const result = layoutSequenceDiagram(diagram);
    expect(result.messages[0].isSelfMessage).toBe(true);
  });

  it("adds title space", () => {
    const withTitle: SequenceDiagramDef = {
      type: "sequence",
      title: "My Diagram",
      participants: [{ id: "a", label: "A" }],
      messages: [],
      style: "hand-drawn",
    };
    const withoutTitle: SequenceDiagramDef = {
      type: "sequence",
      participants: [{ id: "a", label: "A" }],
      messages: [],
      style: "hand-drawn",
    };

    const resultWithTitle = layoutSequenceDiagram(withTitle);
    const resultWithout = layoutSequenceDiagram(withoutTitle);

    // With title should have participants starting lower
    expect(resultWithTitle.participants[0].topY).toBeGreaterThan(
      resultWithout.participants[0].topY
    );
  });
});
