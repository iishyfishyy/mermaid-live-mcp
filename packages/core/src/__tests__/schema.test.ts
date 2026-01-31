import { describe, it, expect } from "vitest";
import { parseDiagram, DiagramSchema, FlowDiagramSchema, SequenceDiagramSchema } from "../schema/index.js";

describe("Schema validation", () => {
  describe("FlowDiagramSchema", () => {
    it("parses a minimal flow diagram", () => {
      const input = {
        type: "flow",
        nodes: [{ id: "a", label: "A" }],
      };
      const result = FlowDiagramSchema.parse(input);
      expect(result.type).toBe("flow");
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].shape).toBe("rectangle"); // default
      expect(result.edges).toEqual([]); // default
      expect(result.groups).toEqual([]); // default
      expect(result.style).toBe("hand-drawn"); // default
      expect(result.direction).toBe("TB"); // default
    });

    it("parses a full flow diagram", () => {
      const input = {
        type: "flow",
        title: "Test",
        direction: "LR",
        style: "clean",
        nodes: [
          { id: "a", label: "A", shape: "rectangle" },
          { id: "b", label: "B", shape: "cylinder" },
        ],
        edges: [
          { from: "a", to: "b", label: "connect", style: "dashed" },
        ],
        groups: [
          { id: "g1", label: "Group", contains: ["a", "b"] },
        ],
      };
      const result = FlowDiagramSchema.parse(input);
      expect(result.title).toBe("Test");
      expect(result.direction).toBe("LR");
      expect(result.style).toBe("clean");
      expect(result.edges[0].style).toBe("dashed");
    });

    it("rejects invalid shape types", () => {
      const input = {
        type: "flow",
        nodes: [{ id: "a", label: "A", shape: "triangle" }],
      };
      expect(() => FlowDiagramSchema.parse(input)).toThrow();
    });
  });

  describe("SequenceDiagramSchema", () => {
    it("parses a minimal sequence diagram", () => {
      const input = {
        type: "sequence",
        participants: [{ id: "a", label: "A" }],
        messages: [{ from: "a", to: "a", label: "self" }],
      };
      const result = SequenceDiagramSchema.parse(input);
      expect(result.type).toBe("sequence");
      expect(result.participants).toHaveLength(1);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].style).toBe("solid"); // default
    });
  });

  describe("DiagramSchema (discriminated union)", () => {
    it("dispatches to flow", () => {
      const result = parseDiagram({
        type: "flow",
        nodes: [{ id: "x", label: "X" }],
      });
      expect(result.type).toBe("flow");
    });

    it("dispatches to sequence", () => {
      const result = parseDiagram({
        type: "sequence",
        participants: [{ id: "x", label: "X" }],
        messages: [],
      });
      expect(result.type).toBe("sequence");
    });

    it("rejects unknown diagram types", () => {
      expect(() =>
        parseDiagram({ type: "unknown", nodes: [] })
      ).toThrow();
    });
  });
});
