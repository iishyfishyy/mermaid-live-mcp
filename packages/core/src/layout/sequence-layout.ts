import type {
  SequenceDiagramDef,
  SequenceParticipant,
  SequenceMessage,
  SequenceLayoutResult,
  EdgeStyle,
} from "../schema/types.js";

const PADDING = 40;
const PARTICIPANT_BOX_HEIGHT = 40;
const PARTICIPANT_GAP = 60;
const PARTICIPANT_MIN_WIDTH = 100;
const PARTICIPANT_CHAR_WIDTH = 10;
const PARTICIPANT_LABEL_PADDING = 40;
const TITLE_HEIGHT = 40;
const MESSAGE_SPACING = 50;
const SELF_MESSAGE_HEIGHT_OFFSET = 30;
const LIFELINE_BOTTOM_PADDING = 40;

function computeParticipantWidth(label: string): number {
  return Math.max(
    PARTICIPANT_MIN_WIDTH,
    label.length * PARTICIPANT_CHAR_WIDTH + PARTICIPANT_LABEL_PADDING,
  );
}

export function layoutSequenceDiagram(
  diagram: SequenceDiagramDef,
): SequenceLayoutResult {
  const { title, participants: participantDefs, messages: messageDefs } = diagram;

  // Determine starting Y based on whether a title is present
  const startY = title ? PADDING + TITLE_HEIGHT : PADDING;

  // ---------- Compute participant widths ----------
  const widths = participantDefs.map((p) => computeParticipantWidth(p.label));

  // ---------- Compute horizontal positions ----------
  // Each participant's center x is accumulated left-to-right with gaps between boxes.
  const centerXs: number[] = [];
  let cursorX = PADDING; // left edge of the first participant box

  for (let i = 0; i < participantDefs.length; i++) {
    const halfW = widths[i] / 2;
    centerXs.push(cursorX + halfW);
    cursorX += widths[i] + PARTICIPANT_GAP;
  }

  // ---------- Layout messages ----------
  const participantMap = new Map<string, number>();
  participantDefs.forEach((p, i) => participantMap.set(p.id, i));

  const messageTopY = startY + PARTICIPANT_BOX_HEIGHT + MESSAGE_SPACING;

  const layoutMessages: SequenceMessage[] = [];
  let messageY = messageTopY;

  for (const msg of messageDefs) {
    const isSelfMessage = msg.from === msg.to;

    layoutMessages.push({
      from: msg.from,
      to: msg.to,
      label: msg.label,
      y: messageY,
      style: msg.style as EdgeStyle,
      color: msg.color,
      isSelfMessage,
    });

    // Self-messages consume extra vertical space for the loop-back arc
    messageY += isSelfMessage
      ? MESSAGE_SPACING + SELF_MESSAGE_HEIGHT_OFFSET
      : MESSAGE_SPACING;
  }

  // ---------- Compute lifeline extents ----------
  const lastMessageY =
    layoutMessages.length > 0
      ? layoutMessages[layoutMessages.length - 1].y
      : startY + PARTICIPANT_BOX_HEIGHT;

  // Account for self-message extra height on the very last message
  const lastMsg = layoutMessages[layoutMessages.length - 1];
  const lastMessageBottomY =
    lastMsg && lastMsg.isSelfMessage
      ? lastMsg.y + SELF_MESSAGE_HEIGHT_OFFSET
      : lastMessageY;

  const lifelineBottomY = lastMessageBottomY + LIFELINE_BOTTOM_PADDING;

  // ---------- Build participant layout objects ----------
  const layoutParticipants: SequenceParticipant[] = participantDefs.map(
    (p, i) => ({
      id: p.id,
      label: p.label,
      x: centerXs[i],
      topY: startY,
      bottomY: lifelineBottomY,
      width: widths[i],
      color: p.color,
    }),
  );

  // ---------- Total diagram dimensions ----------
  const totalWidth =
    participantDefs.length > 0
      ? centerXs[centerXs.length - 1] +
        widths[widths.length - 1] / 2 +
        PADDING
      : PADDING * 2;

  const totalHeight = lifelineBottomY + PADDING;

  return {
    width: totalWidth,
    height: totalHeight,
    participants: layoutParticipants,
    messages: layoutMessages,
  };
}
