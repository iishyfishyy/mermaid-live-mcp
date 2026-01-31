import type {
  LayoutResult,
  LayoutNode,
  LayoutEdge,
  LayoutGroup,
  SequenceLayoutResult,
  SequenceParticipant,
  SequenceMessage,
  Theme,
  ShapeType,
  EdgeStyle,
  ArrowDirection,
} from "../schema/types.js";

// ── Color palette ──

const PALETTE = [
  "#4ECDC4",
  "#FF6B6B",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
  "#98D8C8",
  "#F7DC6F",
  "#BB8FCE",
  "#85C1E9",
];

// ── Theme configuration ──

interface ThemeConfig {
  strokeWidth: number;
  jitterAmount: number;
  fillOpacity: number;
  fontFamily: string;
  doubleStroke: boolean;
  cornerRadius: number;
}

function getThemeConfig(theme: Theme): ThemeConfig {
  switch (theme) {
    case "hand-drawn":
      return {
        strokeWidth: 1.5,
        jitterAmount: 2,
        fillOpacity: 0.15,
        fontFamily: '"Segoe Print", "Comic Sans MS", cursive',
        doubleStroke: true,
        cornerRadius: 0,
      };
    case "clean":
      return {
        strokeWidth: 1.5,
        jitterAmount: 0,
        fillOpacity: 0.1,
        fontFamily: '"Inter", "Helvetica", "Arial", sans-serif',
        doubleStroke: false,
        cornerRadius: 3,
      };
    case "minimal":
      return {
        strokeWidth: 1,
        jitterAmount: 0,
        fillOpacity: 0.05,
        fontFamily: '"Inter", "Helvetica", "Arial", sans-serif',
        doubleStroke: false,
        cornerRadius: 3,
      };
  }
}

// ── Deterministic pseudo-random number generator ──
// We use a seeded PRNG so that the same diagram produces the same SVG output
// across renders (important for testing and caching).

let seed = 42;

function resetSeed(): void {
  seed = 42;
}

function pseudoRandom(): number {
  seed = (seed * 16807 + 0) % 2147483647;
  return (seed - 1) / 2147483646;
}

// ── Jitter and sketchy helpers ──

function jitter(value: number, amount: number): number {
  if (amount === 0) return value;
  return value + (pseudoRandom() - 0.5) * 2 * amount;
}

function jitterPoint(
  x: number,
  y: number,
  amount: number,
): { x: number; y: number } {
  return { x: jitter(x, amount), y: jitter(y, amount) };
}

// ── SVG string escaping ──

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── SVG Builder ──

class SvgBuilder {
  private elements: string[] = [];
  private defs: string[] = [];
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  addDef(defString: string): void {
    this.defs.push(defString);
  }

  addElement(svgString: string): void {
    this.elements.push(svgString);
  }

  toString(): string {
    const parts: string[] = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.width} ${this.height}" width="${this.width}" height="${this.height}">`,
    );

    // Defs section (arrowheads, filters, etc.)
    if (this.defs.length > 0) {
      parts.push("  <defs>");
      for (const def of this.defs) {
        parts.push(`    ${def}`);
      }
      parts.push("  </defs>");
    }

    // White background
    parts.push(
      `  <rect width="${this.width}" height="${this.height}" fill="white"/>`,
    );

    // All accumulated elements
    for (const el of this.elements) {
      parts.push(`  ${el}`);
    }

    parts.push("</svg>");
    return parts.join("\n");
  }
}

// ── Text wrapping ──

function wrapText(text: string, maxCharsPerLine: number): string[] {
  if (text.length <= maxCharsPerLine) return [text];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length === 0) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= maxCharsPerLine) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

// ── Text rendering ──

function renderText(
  x: number,
  y: number,
  text: string,
  fontSize: number,
  fontFamily: string,
  color: string,
  opts: { bold?: boolean; maxWidth?: number; maxCharsPerLine?: number } = {},
): string {
  const escaped = escapeXml(text);
  const bold = opts.bold ? ' font-weight="bold"' : "";
  const maxChars = opts.maxCharsPerLine ?? 18;

  if (text.length > 20) {
    const lines = wrapText(text, maxChars);
    const lineHeight = fontSize * 1.3;
    const totalHeight = (lines.length - 1) * lineHeight;
    const startY = y - totalHeight / 2;

    const tspans = lines
      .map(
        (line, i) =>
          `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
      )
      .join("");

    return (
      `<text x="${x}" y="${startY}" text-anchor="middle" dominant-baseline="central" ` +
      `font-family='${fontFamily}' font-size="${fontSize}" fill="${color}"${bold}>` +
      `${tspans}</text>`
    );
  }

  return (
    `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family='${fontFamily}' font-size="${fontSize}" fill="${color}"${bold}>` +
    `${escaped}</text>`
  );
}

// ── Sketchy line drawing ──

function sketchyLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  config: ThemeConfig,
  strokeColor: string,
  dashArray?: string,
): string {
  const { jitterAmount, strokeWidth, doubleStroke } = config;
  const parts: string[] = [];

  if (jitterAmount > 0) {
    // Hand-drawn: use a quadratic bezier with a slight midpoint offset
    const mx = (x1 + x2) / 2 + (pseudoRandom() - 0.5) * jitterAmount * 2;
    const my = (y1 + y2) / 2 + (pseudoRandom() - 0.5) * jitterAmount * 2;
    const jx1 = jitter(x1, jitterAmount * 0.5);
    const jy1 = jitter(y1, jitterAmount * 0.5);
    const jx2 = jitter(x2, jitterAmount * 0.5);
    const jy2 = jitter(y2, jitterAmount * 0.5);

    const dash = dashArray ? ` stroke-dasharray="${dashArray}"` : "";
    parts.push(
      `<path d="M ${jx1.toFixed(1)} ${jy1.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${jx2.toFixed(1)} ${jy2.toFixed(1)}" ` +
        `fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round"${dash}/>`,
    );

    if (doubleStroke) {
      // Second pass with slightly different jitter for hand-drawn look
      const mx2 = (x1 + x2) / 2 + (pseudoRandom() - 0.5) * jitterAmount * 2;
      const my2 = (y1 + y2) / 2 + (pseudoRandom() - 0.5) * jitterAmount * 2;
      parts.push(
        `<path d="M ${jitter(x1, jitterAmount * 0.3).toFixed(1)} ${jitter(y1, jitterAmount * 0.3).toFixed(1)} ` +
          `Q ${mx2.toFixed(1)} ${my2.toFixed(1)} ${jitter(x2, jitterAmount * 0.3).toFixed(1)} ${jitter(y2, jitterAmount * 0.3).toFixed(1)}" ` +
          `fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.5}" stroke-linecap="round" opacity="0.3"${dash}/>`,
      );
    }
  } else {
    // Clean/minimal: straight line
    const dash = dashArray ? ` stroke-dasharray="${dashArray}"` : "";
    parts.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ` +
        `stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round"${dash}/>`,
    );
  }

  return parts.join("\n");
}

// ── Sketchy polyline (for edges with multiple points) ──

function sketchyPolyline(
  points: Array<{ x: number; y: number }>,
  config: ThemeConfig,
  strokeColor: string,
  dashArray?: string,
): string {
  if (points.length < 2) return "";

  const segments: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push(
      sketchyLine(
        points[i].x,
        points[i].y,
        points[i + 1].x,
        points[i + 1].y,
        config,
        strokeColor,
        dashArray,
      ),
    );
  }
  return segments.join("\n");
}

// ── Shape rendering ──

function renderRectangle(
  x: number,
  y: number,
  width: number,
  height: number,
  fillColor: string,
  strokeColor: string,
  config: ThemeConfig,
): string {
  const { jitterAmount, strokeWidth, fillOpacity, doubleStroke } = config;

  if (jitterAmount > 0) {
    // Hand-drawn: 4 wobbly lines forming a rectangle
    const tl = jitterPoint(x, y, jitterAmount);
    const tr = jitterPoint(x + width, y, jitterAmount);
    const br = jitterPoint(x + width, y + height, jitterAmount);
    const bl = jitterPoint(x, y + height, jitterAmount);

    // Filled background
    const fillPath =
      `<path d="M ${tl.x.toFixed(1)} ${tl.y.toFixed(1)} L ${tr.x.toFixed(1)} ${tr.y.toFixed(1)} ` +
      `L ${br.x.toFixed(1)} ${br.y.toFixed(1)} L ${bl.x.toFixed(1)} ${bl.y.toFixed(1)} Z" ` +
      `fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="none"/>`;

    // Sketchy border lines
    const edges = [
      sketchyLine(tl.x, tl.y, tr.x, tr.y, config, strokeColor),
      sketchyLine(tr.x, tr.y, br.x, br.y, config, strokeColor),
      sketchyLine(br.x, br.y, bl.x, bl.y, config, strokeColor),
      sketchyLine(bl.x, bl.y, tl.x, tl.y, config, strokeColor),
    ];

    return [fillPath, ...edges].join("\n");
  }

  // Clean/minimal: standard SVG rect
  return (
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" ` +
    `rx="${config.cornerRadius}" ry="${config.cornerRadius}" ` +
    `fill="${fillColor}" fill-opacity="${fillOpacity}" ` +
    `stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`
  );
}

function renderEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fillColor: string,
  strokeColor: string,
  config: ThemeConfig,
): string {
  const { jitterAmount, strokeWidth, fillOpacity, doubleStroke } = config;

  if (jitterAmount > 0) {
    // Hand-drawn: approximate ellipse with bezier curves that have slight irregularity
    const segments = 8;
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push({
        x: cx + jitter(rx * Math.cos(angle), jitterAmount),
        y: cy + jitter(ry * Math.sin(angle), jitterAmount),
      });
    }

    // Build a closed cubic bezier path through these points
    let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 0; i < segments; i++) {
      const curr = points[i];
      const next = points[(i + 1) % segments];
      const cpx1 =
        curr.x + jitter((next.x - curr.x) * 0.4, jitterAmount * 0.5);
      const cpy1 =
        curr.y + jitter((next.y - curr.y) * 0.4, jitterAmount * 0.5);
      const cpx2 =
        next.x - jitter((next.x - curr.x) * 0.4, jitterAmount * 0.5);
      const cpy2 =
        next.y - jitter((next.y - curr.y) * 0.4, jitterAmount * 0.5);
      path += ` C ${cpx1.toFixed(1)} ${cpy1.toFixed(1)}, ${cpx2.toFixed(1)} ${cpy2.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
    }
    path += " Z";

    const parts: string[] = [];
    parts.push(
      `<path d="${path}" fill="${fillColor}" fill-opacity="${fillOpacity}" ` +
        `stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`,
    );

    if (doubleStroke) {
      // Second slightly offset stroke
      const offset = jitterAmount * 0.4;
      parts.push(
        `<path d="${path}" fill="none" ` +
          `stroke="${strokeColor}" stroke-width="${strokeWidth * 0.5}" stroke-linecap="round" opacity="0.3" ` +
          `transform="translate(${jitter(0, offset).toFixed(1)}, ${jitter(0, offset).toFixed(1)})"/>`,
      );
    }

    return parts.join("\n");
  }

  // Clean/minimal: standard SVG ellipse
  return (
    `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" ` +
    `fill="${fillColor}" fill-opacity="${fillOpacity}" ` +
    `stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`
  );
}

function renderDiamond(
  x: number,
  y: number,
  width: number,
  height: number,
  fillColor: string,
  strokeColor: string,
  config: ThemeConfig,
): string {
  const { jitterAmount, strokeWidth, fillOpacity } = config;
  const cx = x + width / 2;
  const cy = y + height / 2;

  const top = jitterPoint(cx, y, jitterAmount);
  const right = jitterPoint(x + width, cy, jitterAmount);
  const bottom = jitterPoint(cx, y + height, jitterAmount);
  const left = jitterPoint(x, cy, jitterAmount);

  if (jitterAmount > 0) {
    const fillPath =
      `<path d="M ${top.x.toFixed(1)} ${top.y.toFixed(1)} L ${right.x.toFixed(1)} ${right.y.toFixed(1)} ` +
      `L ${bottom.x.toFixed(1)} ${bottom.y.toFixed(1)} L ${left.x.toFixed(1)} ${left.y.toFixed(1)} Z" ` +
      `fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="none"/>`;

    const edges = [
      sketchyLine(top.x, top.y, right.x, right.y, config, strokeColor),
      sketchyLine(right.x, right.y, bottom.x, bottom.y, config, strokeColor),
      sketchyLine(bottom.x, bottom.y, left.x, left.y, config, strokeColor),
      sketchyLine(left.x, left.y, top.x, top.y, config, strokeColor),
    ];

    return [fillPath, ...edges].join("\n");
  }

  const pts = `${top.x.toFixed(1)},${top.y.toFixed(1)} ${right.x.toFixed(1)},${right.y.toFixed(1)} ${bottom.x.toFixed(1)},${bottom.y.toFixed(1)} ${left.x.toFixed(1)},${left.y.toFixed(1)}`;
  return (
    `<polygon points="${pts}" ` +
    `fill="${fillColor}" fill-opacity="${fillOpacity}" ` +
    `stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`
  );
}

function renderCylinder(
  x: number,
  y: number,
  width: number,
  height: number,
  fillColor: string,
  strokeColor: string,
  config: ThemeConfig,
): string {
  const { jitterAmount, strokeWidth, fillOpacity } = config;
  const cx = x + width / 2;
  const ellipseRy = Math.min(15, height * 0.15);
  const bodyTop = y + ellipseRy;
  const bodyBottom = y + height - ellipseRy;
  const rx = width / 2;

  const parts: string[] = [];

  // Body rectangle fill
  parts.push(
    `<rect x="${x.toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${width.toFixed(1)}" height="${(bodyBottom - bodyTop).toFixed(1)}" ` +
      `fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="none"/>`,
  );

  // Bottom ellipse (visible lower arc)
  if (jitterAmount > 0) {
    // Full bottom ellipse for visual closure
    parts.push(
      renderEllipse(
        cx,
        bodyBottom,
        rx,
        ellipseRy,
        fillColor,
        strokeColor,
        config,
      ),
    );
    // Left and right vertical lines
    parts.push(
      sketchyLine(x, bodyTop, x, bodyBottom, config, strokeColor),
    );
    parts.push(
      sketchyLine(
        x + width,
        bodyTop,
        x + width,
        bodyBottom,
        config,
        strokeColor,
      ),
    );
    // Top ellipse (filled, on top)
    parts.push(
      renderEllipse(
        cx,
        bodyTop,
        rx,
        ellipseRy,
        fillColor,
        strokeColor,
        config,
      ),
    );
  } else {
    // Clean: standard ellipses and lines
    parts.push(
      `<ellipse cx="${cx.toFixed(1)}" cy="${bodyBottom.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ellipseRy.toFixed(1)}" ` +
        `fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`,
    );
    parts.push(
      `<line x1="${x.toFixed(1)}" y1="${bodyTop.toFixed(1)}" x2="${x.toFixed(1)}" y2="${bodyBottom.toFixed(1)}" ` +
        `stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`,
    );
    parts.push(
      `<line x1="${(x + width).toFixed(1)}" y1="${bodyTop.toFixed(1)}" x2="${(x + width).toFixed(1)}" y2="${bodyBottom.toFixed(1)}" ` +
        `stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`,
    );
    parts.push(
      `<ellipse cx="${cx.toFixed(1)}" cy="${bodyTop.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ellipseRy.toFixed(1)}" ` +
        `fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`,
    );
  }

  return parts.join("\n");
}

function renderCloud(
  x: number,
  y: number,
  width: number,
  height: number,
  fillColor: string,
  strokeColor: string,
  config: ThemeConfig,
): string {
  const { jitterAmount, strokeWidth, fillOpacity } = config;
  const cx = x + width / 2;
  const cy = y + height / 2;

  // Cloud made of overlapping arcs
  const rw = width * 0.28;
  const rh = height * 0.32;

  // Create a cloud-like path using cubic bezier curves
  const j = jitterAmount;
  const top = { x: jitter(cx, j), y: jitter(y + height * 0.15, j) };
  const tr = {
    x: jitter(x + width * 0.82, j),
    y: jitter(y + height * 0.25, j),
  };
  const right = {
    x: jitter(x + width * 0.92, j),
    y: jitter(cy + height * 0.05, j),
  };
  const br = {
    x: jitter(x + width * 0.8, j),
    y: jitter(y + height * 0.8, j),
  };
  const bottom = { x: jitter(cx, j), y: jitter(y + height * 0.88, j) };
  const bl = {
    x: jitter(x + width * 0.2, j),
    y: jitter(y + height * 0.8, j),
  };
  const left = {
    x: jitter(x + width * 0.08, j),
    y: jitter(cy + height * 0.05, j),
  };
  const tl = {
    x: jitter(x + width * 0.18, j),
    y: jitter(y + height * 0.25, j),
  };

  const path =
    `M ${top.x.toFixed(1)} ${top.y.toFixed(1)} ` +
    `C ${jitter(x + width * 0.6, j).toFixed(1)} ${jitter(y - height * 0.05, j).toFixed(1)}, ` +
    `${jitter(x + width * 0.9, j).toFixed(1)} ${jitter(y + height * 0.05, j).toFixed(1)}, ` +
    `${tr.x.toFixed(1)} ${tr.y.toFixed(1)} ` +
    `C ${jitter(x + width * 1.05, j).toFixed(1)} ${jitter(y + height * 0.25, j).toFixed(1)}, ` +
    `${jitter(x + width * 1.02, j).toFixed(1)} ${jitter(y + height * 0.55, j).toFixed(1)}, ` +
    `${right.x.toFixed(1)} ${right.y.toFixed(1)} ` +
    `C ${jitter(x + width * 1.0, j).toFixed(1)} ${jitter(y + height * 0.75, j).toFixed(1)}, ` +
    `${jitter(x + width * 0.9, j).toFixed(1)} ${jitter(y + height * 0.9, j).toFixed(1)}, ` +
    `${br.x.toFixed(1)} ${br.y.toFixed(1)} ` +
    `C ${jitter(x + width * 0.65, j).toFixed(1)} ${jitter(y + height * 0.98, j).toFixed(1)}, ` +
    `${jitter(x + width * 0.35, j).toFixed(1)} ${jitter(y + height * 0.98, j).toFixed(1)}, ` +
    `${bottom.x.toFixed(1)} ${bottom.y.toFixed(1)} ` +
    `C ${jitter(x + width * 0.3, j).toFixed(1)} ${jitter(y + height * 0.95, j).toFixed(1)}, ` +
    `${jitter(x + width * 0.1, j).toFixed(1)} ${jitter(y + height * 0.9, j).toFixed(1)}, ` +
    `${bl.x.toFixed(1)} ${bl.y.toFixed(1)} ` +
    `C ${jitter(x - width * 0.02, j).toFixed(1)} ${jitter(y + height * 0.75, j).toFixed(1)}, ` +
    `${jitter(x - width * 0.02, j).toFixed(1)} ${jitter(y + height * 0.55, j).toFixed(1)}, ` +
    `${left.x.toFixed(1)} ${left.y.toFixed(1)} ` +
    `C ${jitter(x - width * 0.05, j).toFixed(1)} ${jitter(y + height * 0.25, j).toFixed(1)}, ` +
    `${jitter(x + width * 0.1, j).toFixed(1)} ${jitter(y + height * 0.05, j).toFixed(1)}, ` +
    `${tl.x.toFixed(1)} ${tl.y.toFixed(1)} ` +
    `C ${jitter(x + width * 0.25, j).toFixed(1)} ${jitter(y - height * 0.05, j).toFixed(1)}, ` +
    `${jitter(x + width * 0.4, j).toFixed(1)} ${jitter(y - height * 0.05, j).toFixed(1)}, ` +
    `${top.x.toFixed(1)} ${top.y.toFixed(1)} Z`;

  const parts: string[] = [];
  parts.push(
    `<path d="${path}" fill="${fillColor}" fill-opacity="${fillOpacity}" ` +
      `stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`,
  );

  if (config.doubleStroke) {
    parts.push(
      `<path d="${path}" fill="none" ` +
        `stroke="${strokeColor}" stroke-width="${strokeWidth * 0.5}" stroke-linecap="round" opacity="0.2" ` +
        `transform="translate(${jitter(0, 1).toFixed(1)}, ${jitter(0, 1).toFixed(1)})"/>`,
    );
  }

  return parts.join("\n");
}

function renderHexagon(
  x: number,
  y: number,
  width: number,
  height: number,
  fillColor: string,
  strokeColor: string,
  config: ThemeConfig,
): string {
  const { jitterAmount, strokeWidth, fillOpacity } = config;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const inset = width * 0.25;

  const points = [
    jitterPoint(x + inset, y, jitterAmount),
    jitterPoint(x + width - inset, y, jitterAmount),
    jitterPoint(x + width, cy, jitterAmount),
    jitterPoint(x + width - inset, y + height, jitterAmount),
    jitterPoint(x + inset, y + height, jitterAmount),
    jitterPoint(x, cy, jitterAmount),
  ];

  if (jitterAmount > 0) {
    const fillPath =
      `<path d="M ${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")} Z" ` +
      `fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="none"/>`;

    const edges: string[] = [];
    for (let i = 0; i < points.length; i++) {
      const from = points[i];
      const to = points[(i + 1) % points.length];
      edges.push(
        sketchyLine(from.x, from.y, to.x, to.y, config, strokeColor),
      );
    }

    return [fillPath, ...edges].join("\n");
  }

  const pts = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return (
    `<polygon points="${pts}" ` +
    `fill="${fillColor}" fill-opacity="${fillOpacity}" ` +
    `stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`
  );
}

function renderParallelogram(
  x: number,
  y: number,
  width: number,
  height: number,
  fillColor: string,
  strokeColor: string,
  config: ThemeConfig,
): string {
  const { jitterAmount, strokeWidth, fillOpacity } = config;
  const skew = 15;

  const points = [
    jitterPoint(x + skew, y, jitterAmount),
    jitterPoint(x + width, y, jitterAmount),
    jitterPoint(x + width - skew, y + height, jitterAmount),
    jitterPoint(x, y + height, jitterAmount),
  ];

  if (jitterAmount > 0) {
    const fillPath =
      `<path d="M ${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")} Z" ` +
      `fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="none"/>`;

    const edges: string[] = [];
    for (let i = 0; i < points.length; i++) {
      const from = points[i];
      const to = points[(i + 1) % points.length];
      edges.push(
        sketchyLine(from.x, from.y, to.x, to.y, config, strokeColor),
      );
    }

    return [fillPath, ...edges].join("\n");
  }

  const pts = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return (
    `<polygon points="${pts}" ` +
    `fill="${fillColor}" fill-opacity="${fillOpacity}" ` +
    `stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`
  );
}

// ── Shape dispatcher ──

function renderShape(
  node: LayoutNode,
  config: ThemeConfig,
  colorIndex: number,
): string {
  const fillColor = node.color ?? PALETTE[colorIndex % PALETTE.length];
  const strokeColor = darkenColor(fillColor, 0.3);
  const textColor = node.textColor ?? "#333333";
  const { x, y, width, height } = node;

  let shapeSvg: string;

  switch (node.shape) {
    case "rectangle":
      shapeSvg = renderRectangle(
        x,
        y,
        width,
        height,
        fillColor,
        strokeColor,
        config,
      );
      break;
    case "ellipse":
      shapeSvg = renderEllipse(
        x + width / 2,
        y + height / 2,
        width / 2,
        height / 2,
        fillColor,
        strokeColor,
        config,
      );
      break;
    case "diamond":
      shapeSvg = renderDiamond(
        x,
        y,
        width,
        height,
        fillColor,
        strokeColor,
        config,
      );
      break;
    case "cylinder":
      shapeSvg = renderCylinder(
        x,
        y,
        width,
        height,
        fillColor,
        strokeColor,
        config,
      );
      break;
    case "cloud":
      shapeSvg = renderCloud(
        x,
        y,
        width,
        height,
        fillColor,
        strokeColor,
        config,
      );
      break;
    case "hexagon":
      shapeSvg = renderHexagon(
        x,
        y,
        width,
        height,
        fillColor,
        strokeColor,
        config,
      );
      break;
    case "parallelogram":
      shapeSvg = renderParallelogram(
        x,
        y,
        width,
        height,
        fillColor,
        strokeColor,
        config,
      );
      break;
    default: {
      // Fallback to rectangle for any unknown shapes
      const _exhaustive: never = node.shape;
      shapeSvg = renderRectangle(
        x,
        y,
        width,
        height,
        fillColor,
        strokeColor,
        config,
      );
      break;
    }
  }

  // Add label text centered in the shape's usable body area
  const textX = x + width / 2;
  let textY = y + height / 2;

  if (node.shape === "cylinder") {
    const ellipseRy = Math.min(15, height * 0.15);
    textY += ellipseRy / 2;
  } else if (node.shape === "cloud") {
    textY += height * 0.04;
  }
  const label = renderText(textX, textY, node.label, 14, config.fontFamily, textColor, {
    maxCharsPerLine: 18,
  });

  return `<g class="node" data-id="${escapeXml(node.id)}">\n${shapeSvg}\n${label}\n</g>`;
}

// ── Color utilities ──

function darkenColor(hex: string, amount: number): string {
  // Parse hex color and darken it
  const cleaned = hex.replace("#", "");
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);

  const dr = Math.max(0, Math.round(r * (1 - amount)));
  const dg = Math.max(0, Math.round(g * (1 - amount)));
  const db = Math.max(0, Math.round(b * (1 - amount)));

  return `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
}

// ── Dash pattern for edge styles ──

function getDashArray(style: EdgeStyle): string | undefined {
  switch (style) {
    case "solid":
      return undefined;
    case "dashed":
      return "8,4";
    case "dotted":
      return "3,3";
  }
}

// ── Arrow rendering ──

function renderArrowhead(
  tipX: number,
  tipY: number,
  fromX: number,
  fromY: number,
  color: string,
  config: ThemeConfig,
): string {
  const size = 10;
  const angle = Math.atan2(tipY - fromY, tipX - fromX);
  const leftAngle = angle + Math.PI * 0.82;
  const rightAngle = angle - Math.PI * 0.82;

  const x1 = tipX + size * Math.cos(leftAngle);
  const y1 = tipY + size * Math.sin(leftAngle);
  const x2 = tipX + size * Math.cos(rightAngle);
  const y2 = tipY + size * Math.sin(rightAngle);

  const { jitterAmount } = config;
  const jx1 = jitter(x1, jitterAmount * 0.5);
  const jy1 = jitter(y1, jitterAmount * 0.5);
  const jx2 = jitter(x2, jitterAmount * 0.5);
  const jy2 = jitter(y2, jitterAmount * 0.5);
  const jtx = jitter(tipX, jitterAmount * 0.3);
  const jty = jitter(tipY, jitterAmount * 0.3);

  return (
    `<polygon points="${jtx.toFixed(1)},${jty.toFixed(1)} ${jx1.toFixed(1)},${jy1.toFixed(1)} ${jx2.toFixed(1)},${jy2.toFixed(1)}" ` +
    `fill="${color}" stroke="${color}" stroke-width="${config.strokeWidth * 0.5}" stroke-linejoin="round"/>`
  );
}

function renderEdge(
  edge: LayoutEdge,
  nodesById: Map<string, LayoutNode>,
  config: ThemeConfig,
): string {
  const { points, style, direction, label, color } = edge;
  if (points.length < 2) return "";

  const strokeColor = color ?? "#666666";
  const dashArray = getDashArray(style);

  const parts: string[] = [];

  // Draw the edge line
  parts.push(sketchyPolyline(points, config, strokeColor, dashArray));

  // Arrowheads based on direction
  if (direction === "forward" || direction === "both") {
    const tip = points[points.length - 1];
    const from = points[points.length - 2];
    parts.push(renderArrowhead(tip.x, tip.y, from.x, from.y, strokeColor, config));
  }
  if (direction === "backward" || direction === "both") {
    const tip = points[0];
    const from = points[1];
    parts.push(renderArrowhead(tip.x, tip.y, from.x, from.y, strokeColor, config));
  }

  // Edge label at midpoint
  if (label) {
    const midIdx = Math.floor(points.length / 2);
    let mx: number, my: number;

    if (points.length % 2 === 0) {
      // Even number of points: average the two middle points
      mx = (points[midIdx - 1].x + points[midIdx].x) / 2;
      my = (points[midIdx - 1].y + points[midIdx].y) / 2;
    } else {
      mx = points[midIdx].x;
      my = points[midIdx].y;
    }

    // Estimate label width for the background rectangle
    const labelWidth = Math.max(label.length * 7 + 12, 30);
    const labelHeight = 20;

    parts.push(
      `<rect x="${(mx - labelWidth / 2).toFixed(1)}" y="${(my - labelHeight / 2 - 2).toFixed(1)}" ` +
        `width="${labelWidth.toFixed(1)}" height="${labelHeight.toFixed(1)}" ` +
        `rx="3" ry="3" fill="white" fill-opacity="0.9" stroke="none"/>`,
    );
    parts.push(
      renderText(mx, my - 2, label, 12, config.fontFamily, strokeColor),
    );
  }

  return `<g class="edge" data-from="${escapeXml(edge.from)}" data-to="${escapeXml(edge.to)}">\n${parts.join("\n")}\n</g>`;
}

// ── Group rendering ──

function renderGroup(group: LayoutGroup, config: ThemeConfig): string {
  const { x, y, width, height, label, color } = group;
  const strokeColor = color ?? "#AAAAAA";
  const fillColor = color ?? "#F5F5F5";

  const parts: string[] = [];

  if (config.jitterAmount > 0) {
    // Hand-drawn dashed rectangle
    const tl = jitterPoint(x, y, config.jitterAmount);
    const tr = jitterPoint(x + width, y, config.jitterAmount);
    const br = jitterPoint(x + width, y + height, config.jitterAmount);
    const bl = jitterPoint(x, y + height, config.jitterAmount);

    parts.push(
      `<path d="M ${tl.x.toFixed(1)} ${tl.y.toFixed(1)} L ${tr.x.toFixed(1)} ${tr.y.toFixed(1)} ` +
        `L ${br.x.toFixed(1)} ${br.y.toFixed(1)} L ${bl.x.toFixed(1)} ${bl.y.toFixed(1)} Z" ` +
        `fill="${fillColor}" fill-opacity="0.05" stroke="none"/>`,
    );
    parts.push(
      sketchyLine(tl.x, tl.y, tr.x, tr.y, config, strokeColor, "6,4"),
    );
    parts.push(
      sketchyLine(tr.x, tr.y, br.x, br.y, config, strokeColor, "6,4"),
    );
    parts.push(
      sketchyLine(br.x, br.y, bl.x, bl.y, config, strokeColor, "6,4"),
    );
    parts.push(
      sketchyLine(bl.x, bl.y, tl.x, tl.y, config, strokeColor, "6,4"),
    );
  } else {
    parts.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" ` +
        `rx="${config.cornerRadius}" ry="${config.cornerRadius}" ` +
        `fill="${fillColor}" fill-opacity="0.05" ` +
        `stroke="${strokeColor}" stroke-width="${config.strokeWidth}" stroke-dasharray="6,4"/>`,
    );
  }

  // Group label at top-left corner
  if (label) {
    parts.push(
      renderText(
        x + 12,
        y + 14,
        label,
        12,
        config.fontFamily,
        strokeColor,
        { bold: false },
      ).replace('text-anchor="middle"', 'text-anchor="start"'),
    );
  }

  return `<g class="group" data-id="${escapeXml(group.id)}">\n${parts.join("\n")}\n</g>`;
}

// ── Title rendering ──

function renderTitle(
  title: string,
  svgWidth: number,
  config: ThemeConfig,
): string {
  return renderText(
    svgWidth / 2,
    24,
    title,
    18,
    config.fontFamily,
    "#333333",
    { bold: true },
  );
}

// ── Sequence diagram helpers ──

function renderParticipantBox(
  participant: SequenceParticipant,
  yTop: number,
  config: ThemeConfig,
  colorIndex: number,
): string {
  const boxHeight = 40;
  const fillColor = participant.color ?? PALETTE[colorIndex % PALETTE.length];
  const strokeColor = darkenColor(fillColor, 0.3);
  const bx = participant.x - participant.width / 2;
  const by = yTop;

  const parts: string[] = [];

  parts.push(
    renderRectangle(
      bx,
      by,
      participant.width,
      boxHeight,
      fillColor,
      strokeColor,
      config,
    ),
  );

  parts.push(
    renderText(
      participant.x,
      by + boxHeight / 2,
      participant.label,
      13,
      config.fontFamily,
      "#333333",
      { maxCharsPerLine: 18 },
    ),
  );

  return parts.join("\n");
}

function renderLifeline(
  participant: SequenceParticipant,
  config: ThemeConfig,
): string {
  const startY = participant.topY + 40;
  const endY = participant.bottomY;
  return sketchyLine(
    participant.x,
    startY,
    participant.x,
    endY,
    config,
    "#999999",
    "6,4",
  );
}

function renderMessage(
  msg: SequenceMessage,
  participantsById: Map<string, SequenceParticipant>,
  config: ThemeConfig,
): string {
  const fromP = participantsById.get(msg.from);
  const toP = participantsById.get(msg.to);
  if (!fromP || !toP) return "";

  const strokeColor = msg.color ?? "#666666";
  const dashArray = getDashArray(msg.style);
  const parts: string[] = [];

  if (msg.isSelfMessage) {
    // Self-message: loop going right and back
    const sx = fromP.x;
    const sy = msg.y;
    const loopWidth = 30;
    const loopHeight = 20;

    if (config.jitterAmount > 0) {
      // Sketchy self-loop
      const j = config.jitterAmount;
      const path =
        `M ${jitter(sx, j).toFixed(1)} ${jitter(sy, j).toFixed(1)} ` +
        `L ${jitter(sx + loopWidth, j).toFixed(1)} ${jitter(sy, j).toFixed(1)} ` +
        `L ${jitter(sx + loopWidth, j).toFixed(1)} ${jitter(sy + loopHeight, j).toFixed(1)} ` +
        `L ${jitter(sx, j).toFixed(1)} ${jitter(sy + loopHeight, j).toFixed(1)}`;
      const dash = dashArray ? ` stroke-dasharray="${dashArray}"` : "";
      parts.push(
        `<path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${config.strokeWidth}" stroke-linecap="round"${dash}/>`,
      );
    } else {
      const dash = dashArray ? ` stroke-dasharray="${dashArray}"` : "";
      const path =
        `M ${sx.toFixed(1)} ${sy.toFixed(1)} ` +
        `L ${(sx + loopWidth).toFixed(1)} ${sy.toFixed(1)} ` +
        `L ${(sx + loopWidth).toFixed(1)} ${(sy + loopHeight).toFixed(1)} ` +
        `L ${sx.toFixed(1)} ${(sy + loopHeight).toFixed(1)}`;
      parts.push(
        `<path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${config.strokeWidth}" stroke-linecap="round"${dash}/>`,
      );
    }

    // Arrowhead pointing left at the return point
    parts.push(
      renderArrowhead(
        fromP.x,
        msg.y + loopHeight,
        fromP.x + loopWidth,
        msg.y + loopHeight,
        strokeColor,
        config,
      ),
    );

    // Label to the right of the loop
    const labelX = sx + loopWidth + 8;
    const labelY = sy + loopHeight / 2;
    parts.push(
      renderText(labelX, labelY, msg.label, 12, config.fontFamily, strokeColor).replace(
        'text-anchor="middle"',
        'text-anchor="start"',
      ),
    );
  } else {
    // Normal message: horizontal arrow between participants
    const fromX = fromP.x;
    const toX = toP.x;
    const y = msg.y;

    const linePoints = [
      { x: fromX, y },
      { x: toX, y },
    ];

    parts.push(sketchyPolyline(linePoints, config, strokeColor, dashArray));

    // Arrow at the receiving end
    parts.push(
      renderArrowhead(toX, y, fromX, y, strokeColor, config),
    );

    // Label above the arrow at midpoint
    const midX = (fromX + toX) / 2;
    const labelY = y - 8;

    // White background for label
    const labelWidth = Math.max(msg.label.length * 7 + 12, 30);
    const labelHeight = 18;
    parts.push(
      `<rect x="${(midX - labelWidth / 2).toFixed(1)}" y="${(labelY - labelHeight / 2).toFixed(1)}" ` +
        `width="${labelWidth.toFixed(1)}" height="${labelHeight.toFixed(1)}" ` +
        `rx="3" ry="3" fill="white" fill-opacity="0.9" stroke="none"/>`,
    );
    parts.push(
      renderText(midX, labelY, msg.label, 12, config.fontFamily, strokeColor),
    );
  }

  return `<g class="message">\n${parts.join("\n")}\n</g>`;
}

// ── Public API ──

/**
 * Renders a flow diagram layout to an SVG string.
 *
 * @param layout - The computed layout with positioned nodes, edges, and groups
 * @param theme - Visual theme ("hand-drawn", "clean", or "minimal")
 * @param title - Optional title to display at the top of the diagram
 * @returns A complete SVG document as a string
 */
export function renderFlowDiagram(
  layout: LayoutResult,
  theme: Theme,
  title?: string,
): string {
  resetSeed();
  const config = getThemeConfig(theme);

  // Add padding for title if present
  const titleOffset = title ? 40 : 0;
  const svgWidth = layout.width;
  const svgHeight = layout.height + titleOffset;

  const svg = new SvgBuilder(svgWidth, svgHeight);

  // Build a lookup map for nodes by id
  const nodesById = new Map<string, LayoutNode>();
  for (const node of layout.nodes) {
    nodesById.set(node.id, node);
  }

  // Title
  if (title) {
    svg.addElement(renderTitle(title, svgWidth, config));
  }

  // Wrapping group with title offset transform
  const contentParts: string[] = [];

  // 1. Groups (rendered first, as background)
  for (const group of layout.groups) {
    contentParts.push(renderGroup(group, config));
  }

  // 2. Edges (behind nodes)
  for (const edge of layout.edges) {
    contentParts.push(renderEdge(edge, nodesById, config));
  }

  // 3. Nodes (on top)
  for (let i = 0; i < layout.nodes.length; i++) {
    contentParts.push(renderShape(layout.nodes[i], config, i));
  }

  if (titleOffset > 0) {
    svg.addElement(
      `<g transform="translate(0, ${titleOffset})">\n${contentParts.join("\n")}\n</g>`,
    );
  } else {
    for (const part of contentParts) {
      svg.addElement(part);
    }
  }

  return svg.toString();
}

/**
 * Renders a sequence diagram layout to an SVG string.
 *
 * @param layout - The computed layout with positioned participants and messages
 * @param theme - Visual theme ("hand-drawn", "clean", or "minimal")
 * @param title - Optional title to display at the top of the diagram
 * @returns A complete SVG document as a string
 */
export function renderSequenceDiagram(
  layout: SequenceLayoutResult,
  theme: Theme,
  title?: string,
): string {
  resetSeed();
  const config = getThemeConfig(theme);

  // Add padding for title if present
  const titleOffset = title ? 40 : 0;
  const svgWidth = layout.width;
  const svgHeight = layout.height + titleOffset;

  const svg = new SvgBuilder(svgWidth, svgHeight);

  // Build participant lookup
  const participantsById = new Map<string, SequenceParticipant>();
  for (const p of layout.participants) {
    participantsById.set(p.id, p);
  }

  // Title
  if (title) {
    svg.addElement(renderTitle(title, svgWidth, config));
  }

  const contentParts: string[] = [];

  // 1. Lifelines (dashed vertical lines behind everything)
  for (const participant of layout.participants) {
    contentParts.push(renderLifeline(participant, config));
  }

  // 2. Messages (arrows between participants)
  for (const msg of layout.messages) {
    contentParts.push(renderMessage(msg, participantsById, config));
  }

  // 3. Participant boxes at top
  for (let i = 0; i < layout.participants.length; i++) {
    const p = layout.participants[i];
    contentParts.push(renderParticipantBox(p, p.topY, config, i));
  }

  // 4. Participant boxes mirrored at bottom of lifelines
  for (let i = 0; i < layout.participants.length; i++) {
    const p = layout.participants[i];
    contentParts.push(renderParticipantBox(p, p.bottomY, config, i));
  }

  if (titleOffset > 0) {
    svg.addElement(
      `<g transform="translate(0, ${titleOffset})">\n${contentParts.join("\n")}\n</g>`,
    );
  } else {
    for (const part of contentParts) {
      svg.addElement(part);
    }
  }

  return svg.toString();
}
