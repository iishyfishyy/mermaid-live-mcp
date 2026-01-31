import type { ElkNode, ElkExtendedEdge, ElkEdgeSection, ELK } from "elkjs/lib/elk.bundled.js";

async function createElk(): Promise<ELK> {
  // elkjs ships as CJS, and the default export is a constructor.
  // Under ESM + Node16 module resolution the import shape varies,
  // so we handle both `{ default: Ctor }` and the bare constructor.
  const mod = await import("elkjs/lib/elk.bundled.js");
  const Ctor: new () => ELK =
    typeof mod.default === "function"
      ? (mod.default as unknown as new () => ELK)
      : (mod as unknown as new () => ELK);
  return new Ctor();
}
import type {
  FlowDiagramDef,
  NodeDef,
  EdgeDef,
  GroupDef,
  LayoutNode,
  LayoutEdge,
  LayoutGroup,
  LayoutResult,
} from "../schema/types.js";

// ── Constants ──

const PADDING = 40;
const NODE_MIN_WIDTH = 120;
const NODE_HEIGHT = 60;
const CHAR_WIDTH_PX = 10;
const NODE_HORIZONTAL_PADDING = 40;
const NODE_SPACING = 50;
const LAYER_SPACING = 80;
const GROUP_PADDING = 30;

// ── Helpers ──

/**
 * Estimate the width of a node based on its label text length.
 * Adds horizontal padding and enforces a minimum width.
 */
function estimateNodeWidth(label: string): number {
  const textWidth = label.length * CHAR_WIDTH_PX;
  return Math.max(NODE_MIN_WIDTH, textWidth + NODE_HORIZONTAL_PADDING);
}

/**
 * Map a diagram direction string (TB, LR, BT, RL) to the ELK
 * `elk.direction` layout option value.
 */
function mapDirection(direction: string): string {
  const mapping: Record<string, string> = {
    TB: "DOWN",
    LR: "RIGHT",
    BT: "UP",
    RL: "LEFT",
  };
  return mapping[direction] ?? "DOWN";
}

/**
 * Build a lookup from node id to the group it belongs to (if any).
 */
function buildNodeToGroupMap(groups: GroupDef[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of groups) {
    for (const nodeId of group.contains) {
      map.set(nodeId, group.id);
    }
  }
  return map;
}

/**
 * Create an ELK child node from a NodeDef.
 */
function toElkChildNode(node: NodeDef): ElkNode {
  const width = node.width ?? estimateNodeWidth(node.label);
  const height = node.height ?? NODE_HEIGHT;
  return {
    id: node.id,
    width,
    height,
    labels: [{ text: node.label }],
  };
}

/**
 * Create an ELK edge from an EdgeDef. Self-loops are included --
 * ELK handles them natively with the layered algorithm.
 */
function toElkEdge(edge: EdgeDef, index: number): ElkExtendedEdge {
  return {
    id: `e${index}_${edge.from}_${edge.to}`,
    sources: [edge.from],
    targets: [edge.to],
    labels: edge.label ? [{ text: edge.label }] : [],
  };
}

/**
 * Extract route points from an ELK edge section, returning an ordered
 * array from startPoint through bend points to endPoint.
 */
function extractRoutePoints(
  sections: ElkEdgeSection[] | undefined,
): Array<{ x: number; y: number }> {
  if (!sections || sections.length === 0) {
    return [];
  }

  const points: Array<{ x: number; y: number }> = [];
  for (const section of sections) {
    points.push({ x: section.startPoint.x, y: section.startPoint.y });
    if (section.bendPoints) {
      for (const bp of section.bendPoints) {
        points.push({ x: bp.x, y: bp.y });
      }
    }
    points.push({ x: section.endPoint.x, y: section.endPoint.y });
  }
  return points;
}

/**
 * Given the root ELK graph result, build a flat id -> positioned-node
 * lookup that accounts for compound (group) nodes. Coordinates stored
 * in the ELK result for children of compound nodes are relative to
 * the parent, so we need to offset them.
 */
function collectNodePositions(
  root: ElkNode,
): Map<string, { x: number; y: number; width: number; height: number }> {
  const positions = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();

  function walk(node: ElkNode, offsetX: number, offsetY: number): void {
    if (node.children) {
      for (const child of node.children) {
        const cx = (child.x ?? 0) + offsetX;
        const cy = (child.y ?? 0) + offsetY;
        const cw = child.width ?? 0;
        const ch = child.height ?? 0;

        // If this child itself has children it is a group node; do not
        // add it to the positions map (groups are handled separately).
        // Walk into it with the accumulated offset so leaf nodes get
        // absolute coordinates.
        if (child.children && child.children.length > 0) {
          walk(child, cx, cy);
        } else {
          positions.set(child.id, { x: cx, y: cy, width: cw, height: ch });
        }
      }
    }
  }

  walk(root, 0, 0);
  return positions;
}

/**
 * Collect group positions from the ELK result. Groups are modelled as
 * compound ElkNodes at the top level of the graph.
 */
function collectGroupPositions(
  root: ElkNode,
): Map<string, { x: number; y: number; width: number; height: number }> {
  const positions = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();

  if (!root.children) return positions;

  for (const child of root.children) {
    if (child.children && child.children.length > 0) {
      positions.set(child.id, {
        x: child.x ?? 0,
        y: child.y ?? 0,
        width: child.width ?? 0,
        height: child.height ?? 0,
      });
    }
  }

  return positions;
}

/**
 * Collect edge route points from the ELK result.  Edges may live on
 * the root graph or inside compound (group) nodes, so we walk the
 * full tree.  Coordinates in edge sections are relative to the
 * containing node, so we accumulate offsets.
 */
function collectEdgeRoutes(
  root: ElkNode,
): Map<string, Array<{ x: number; y: number }>> {
  const routes = new Map<string, Array<{ x: number; y: number }>>();

  function walk(node: ElkNode, offsetX: number, offsetY: number): void {
    if (node.edges) {
      for (const edge of node.edges) {
        const rawPoints = extractRoutePoints(edge.sections);
        const adjustedPoints = rawPoints.map((p) => ({
          x: p.x + offsetX,
          y: p.y + offsetY,
        }));
        routes.set(edge.id, adjustedPoints);
      }
    }
    if (node.children) {
      for (const child of node.children) {
        const cx = (child.x ?? 0) + offsetX;
        const cy = (child.y ?? 0) + offsetY;
        walk(child, cx, cy);
      }
    }
  }

  walk(root, 0, 0);
  return routes;
}

// ── Main layout function ──

export async function layoutFlowDiagram(
  diagram: FlowDiagramDef,
): Promise<LayoutResult> {
  const elk = await createElk();

  const nodes = diagram.nodes;
  const edges = diagram.edges ?? [];
  const groups = diagram.groups ?? [];
  const direction = diagram.direction ?? "TB";

  const nodeToGroup = buildNodeToGroupMap(groups);

  // -- Build ELK graph --------------------------------------------------

  // Group compound nodes keyed by group id
  const groupElkNodes = new Map<string, ElkNode>();
  for (const group of groups) {
    const groupNode: ElkNode = {
      id: group.id,
      labels: group.label ? [{ text: group.label }] : [],
      layoutOptions: {
        "elk.padding": `[top=${GROUP_PADDING},left=${GROUP_PADDING},bottom=${GROUP_PADDING},right=${GROUP_PADDING}]`,
      },
      children: [],
      edges: [],
    };
    groupElkNodes.set(group.id, groupNode);
  }

  // Assign nodes to their group or to the root level
  const rootChildren: ElkNode[] = [];
  for (const node of nodes) {
    const elkChild = toElkChildNode(node);
    const groupId = nodeToGroup.get(node.id);
    if (groupId && groupElkNodes.has(groupId)) {
      groupElkNodes.get(groupId)!.children!.push(elkChild);
    } else {
      rootChildren.push(elkChild);
    }
  }

  // Add group compound nodes as root-level children
  for (const groupNode of groupElkNodes.values()) {
    rootChildren.push(groupNode);
  }

  // Build edges. ELK edges that cross group boundaries must live on
  // the lowest common ancestor. For simplicity we place all edges on
  // the root graph; ELK resolves hierarchy automatically when the
  // `elk.hierarchyHandling` option is set to `INCLUDE_CHILDREN`.
  const elkEdges: ElkExtendedEdge[] = edges.map((e, i) => toElkEdge(e, i));

  const rootGraph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": mapDirection(direction),
      "elk.spacing.nodeNode": String(NODE_SPACING),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(LAYER_SPACING),
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.mergeEdges": "false",
    },
    children: rootChildren,
    edges: elkEdges,
  };

  // -- Run ELK layout ---------------------------------------------------

  const result = await elk.layout(rootGraph);

  // -- Extract positions ------------------------------------------------

  const nodePositions = collectNodePositions(result);
  const groupPositions = collectGroupPositions(result);
  const edgeRoutes = collectEdgeRoutes(result);

  // Build a quick NodeDef lookup by id
  const nodeDefMap = new Map<string, NodeDef>();
  for (const n of nodes) {
    nodeDefMap.set(n.id, n);
  }

  // Map nodes
  const layoutNodes: LayoutNode[] = nodes.map((nodeDef) => {
    const pos = nodePositions.get(nodeDef.id);
    return {
      id: nodeDef.id,
      x: (pos?.x ?? 0) + PADDING,
      y: (pos?.y ?? 0) + PADDING,
      width: pos?.width ?? estimateNodeWidth(nodeDef.label),
      height: pos?.height ?? NODE_HEIGHT,
      label: nodeDef.label,
      shape: nodeDef.shape ?? "rectangle",
      ...(nodeDef.color != null && { color: nodeDef.color }),
      ...(nodeDef.textColor != null && { textColor: nodeDef.textColor }),
    };
  });

  // Map edges
  const layoutEdges: LayoutEdge[] = edges.map((edgeDef, i) => {
    const edgeId = `e${i}_${edgeDef.from}_${edgeDef.to}`;
    const rawPoints = edgeRoutes.get(edgeId) ?? [];
    const points = rawPoints.map((p) => ({
      x: p.x + PADDING,
      y: p.y + PADDING,
    }));

    // Fallback: if ELK produced no route points (e.g. degenerate cases),
    // connect the centres of the source and target nodes.
    if (points.length === 0) {
      const srcPos = nodePositions.get(edgeDef.from);
      const tgtPos = nodePositions.get(edgeDef.to);
      if (srcPos) {
        points.push({
          x: srcPos.x + srcPos.width / 2 + PADDING,
          y: srcPos.y + srcPos.height / 2 + PADDING,
        });
      }
      if (tgtPos) {
        points.push({
          x: tgtPos.x + tgtPos.width / 2 + PADDING,
          y: tgtPos.y + tgtPos.height / 2 + PADDING,
        });
      }
    }

    return {
      from: edgeDef.from,
      to: edgeDef.to,
      ...(edgeDef.label != null && { label: edgeDef.label }),
      style: edgeDef.style ?? "solid",
      direction: edgeDef.direction ?? "forward",
      ...(edgeDef.color != null && { color: edgeDef.color }),
      points,
    };
  });

  // Map groups
  const layoutGroups: LayoutGroup[] = groups.map((groupDef) => {
    const pos = groupPositions.get(groupDef.id);
    return {
      id: groupDef.id,
      ...(groupDef.label != null && { label: groupDef.label }),
      x: (pos?.x ?? 0) + PADDING,
      y: (pos?.y ?? 0) + PADDING,
      width: pos?.width ?? 0,
      height: pos?.height ?? 0,
      ...(groupDef.color != null && { color: groupDef.color }),
    };
  });

  // Compute total diagram dimensions with padding on all sides
  const graphWidth = result.width ?? 0;
  const graphHeight = result.height ?? 0;

  return {
    width: graphWidth + PADDING * 2,
    height: graphHeight + PADDING * 2,
    nodes: layoutNodes,
    edges: layoutEdges,
    groups: layoutGroups,
  };
}
