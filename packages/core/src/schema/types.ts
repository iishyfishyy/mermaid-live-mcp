import { z } from "zod";

// ── Shape types ──
export const ShapeType = z.enum([
  "rectangle",
  "ellipse",
  "diamond",
  "cylinder",
  "cloud",
  "hexagon",
  "parallelogram",
]);
export type ShapeType = z.infer<typeof ShapeType>;

// ── Edge style ──
export const EdgeStyle = z.enum(["solid", "dashed", "dotted"]);
export type EdgeStyle = z.infer<typeof EdgeStyle>;

// ── Arrow direction ──
export const ArrowDirection = z.enum(["forward", "backward", "both", "none"]);
export type ArrowDirection = z.infer<typeof ArrowDirection>;

// ── Theme ──
export const Theme = z.enum(["hand-drawn", "clean", "minimal"]);
export type Theme = z.infer<typeof Theme>;

// ── Diagram type ──
export const DiagramType = z.enum(["flow", "sequence", "er", "class", "state"]);
export type DiagramType = z.infer<typeof DiagramType>;

// ── Output format ──
export const OutputFormat = z.enum(["svg", "png"]);
export type OutputFormat = z.infer<typeof OutputFormat>;

// ── Node schema ──
export const NodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  shape: ShapeType.default("rectangle"),
  color: z.string().optional(),
  textColor: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});
export type NodeDef = z.infer<typeof NodeSchema>;

// ── Edge schema ──
export const EdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  style: EdgeStyle.default("solid"),
  direction: ArrowDirection.default("forward"),
  color: z.string().optional(),
});
export type EdgeDef = z.infer<typeof EdgeSchema>;

// ── Group schema ──
export const GroupSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  contains: z.array(z.string()),
  color: z.string().optional(),
});
export type GroupDef = z.infer<typeof GroupSchema>;

// ── Participant schema (sequence diagrams) ──
export const ParticipantSchema = z.object({
  id: z.string(),
  label: z.string(),
  color: z.string().optional(),
});
export type ParticipantDef = z.infer<typeof ParticipantSchema>;

// ── Message schema (sequence diagrams) ──
export const MessageSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string(),
  style: EdgeStyle.default("solid"),
  color: z.string().optional(),
});
export type MessageDef = z.infer<typeof MessageSchema>;

// ── Output options ──
export const OutputOptions = z.object({
  format: OutputFormat.default("svg"),
  path: z.string().optional(),
});
export type OutputOptions = z.infer<typeof OutputOptions>;

// ── Flow diagram schema ──
export const FlowDiagramSchema = z.object({
  type: z.literal("flow"),
  title: z.string().optional(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema).default([]),
  groups: z.array(GroupSchema).default([]),
  style: Theme.default("hand-drawn"),
  direction: z.enum(["TB", "LR", "BT", "RL"]).default("TB"),
  output: OutputOptions.optional(),
});
export type FlowDiagramDef = z.infer<typeof FlowDiagramSchema>;

// ── Sequence diagram schema ──
export const SequenceDiagramSchema = z.object({
  type: z.literal("sequence"),
  title: z.string().optional(),
  participants: z.array(ParticipantSchema),
  messages: z.array(MessageSchema),
  style: Theme.default("hand-drawn"),
  output: OutputOptions.optional(),
});
export type SequenceDiagramDef = z.infer<typeof SequenceDiagramSchema>;

// ── Union of all diagram types ──
export const DiagramSchema = z.discriminatedUnion("type", [
  FlowDiagramSchema,
  SequenceDiagramSchema,
]);
export type DiagramDef = z.infer<typeof DiagramSchema>;

// ── Layout result types (internal) ──
export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  shape: ShapeType;
  color?: string;
  textColor?: string;
}

export interface LayoutEdge {
  from: string;
  to: string;
  label?: string;
  style: EdgeStyle;
  direction: ArrowDirection;
  color?: string;
  points: Array<{ x: number; y: number }>;
}

export interface LayoutGroup {
  id: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

export interface LayoutResult {
  width: number;
  height: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  groups: LayoutGroup[];
}

// ── Sequence layout types ──
export interface SequenceParticipant {
  id: string;
  label: string;
  x: number;
  topY: number;
  bottomY: number;
  width: number;
  color?: string;
}

export interface SequenceMessage {
  from: string;
  to: string;
  label: string;
  y: number;
  style: EdgeStyle;
  color?: string;
  isSelfMessage: boolean;
}

export interface SequenceLayoutResult {
  width: number;
  height: number;
  participants: SequenceParticipant[];
  messages: SequenceMessage[];
}
