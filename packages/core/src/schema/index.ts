export {
  ShapeType,
  EdgeStyle,
  ArrowDirection,
  Theme,
  DiagramType,
  OutputFormat,
  NodeSchema,
  EdgeSchema,
  GroupSchema,
  ParticipantSchema,
  MessageSchema,
  OutputOptions,
  FlowDiagramSchema,
  SequenceDiagramSchema,
  DiagramSchema,
} from "./types.js";

export type {
  NodeDef,
  EdgeDef,
  GroupDef,
  ParticipantDef,
  MessageDef,
  FlowDiagramDef,
  SequenceDiagramDef,
  DiagramDef,
  LayoutNode,
  LayoutEdge,
  LayoutGroup,
  LayoutResult,
  SequenceParticipant,
  SequenceMessage,
  SequenceLayoutResult,
} from "./types.js";

import { DiagramSchema, type DiagramDef } from "./types.js";

export function parseDiagram(input: unknown): DiagramDef {
  return DiagramSchema.parse(input);
}
