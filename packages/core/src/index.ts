export {
  parseDiagram,
  DiagramSchema,
  FlowDiagramSchema,
  SequenceDiagramSchema,
  NodeSchema,
  EdgeSchema,
  GroupSchema,
  ParticipantSchema,
  MessageSchema,
} from "./schema/index.js";

export type {
  DiagramDef,
  FlowDiagramDef,
  SequenceDiagramDef,
  NodeDef,
  EdgeDef,
  GroupDef,
  ParticipantDef,
  MessageDef,
  LayoutResult,
  LayoutNode,
  LayoutEdge,
  LayoutGroup,
  SequenceLayoutResult,
  SequenceParticipant,
  SequenceMessage,
} from "./schema/index.js";

export type { Theme, ShapeType, EdgeStyle, ArrowDirection } from "./schema/types.js";

export { layoutFlowDiagram } from "./layout/flow-layout.js";
export { layoutSequenceDiagram } from "./layout/sequence-layout.js";

export { renderFlowDiagram, renderSequenceDiagram } from "./render/svg-renderer.js";

export { svgToPng } from "./export.js";

import { parseDiagram } from "./schema/index.js";
import type { DiagramDef, FlowDiagramDef, SequenceDiagramDef } from "./schema/index.js";
import { layoutFlowDiagram } from "./layout/flow-layout.js";
import { layoutSequenceDiagram } from "./layout/sequence-layout.js";
import { renderFlowDiagram, renderSequenceDiagram } from "./render/svg-renderer.js";
import { svgToPng } from "./export.js";

export interface GenerateResult {
  svg: string;
  png?: Buffer;
}

/**
 * Main entry point: takes a raw diagram definition (JSON-compatible object),
 * validates it, computes layout, and renders to SVG (and optionally PNG).
 */
export async function generateDiagram(
  input: unknown,
  options?: { png?: boolean }
): Promise<GenerateResult> {
  const diagram = parseDiagram(input);
  const svg = await renderDiagram(diagram);
  const result: GenerateResult = { svg };

  if (options?.png) {
    result.png = svgToPng(svg);
  }

  return result;
}

async function renderDiagram(diagram: DiagramDef): Promise<string> {
  switch (diagram.type) {
    case "flow": {
      const flow = diagram as FlowDiagramDef;
      const layout = await layoutFlowDiagram(flow);
      return renderFlowDiagram(layout, flow.style, flow.title);
    }
    case "sequence": {
      const seq = diagram as SequenceDiagramDef;
      const layout = layoutSequenceDiagram(seq);
      return renderSequenceDiagram(layout, seq.style, seq.title);
    }
    default: {
      const _exhaustive: never = diagram;
      throw new Error(`Unsupported diagram type: ${(_exhaustive as DiagramDef).type}`);
    }
  }
}
