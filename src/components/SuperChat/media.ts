import { DateTime } from 'luxon';
import type { SuperChatConversation, SuperChatMediaItem } from './types';

/**
 * Flatten explicit attachments in chronological message order. No Markdown or
 * custom metadata is interpreted as media. The source objects are preserved,
 * so actions can address the same message in either conversation view.
 */
export function getConversationMediaItems(
  conversation: SuperChatConversation
): SuperChatMediaItem[] {
  const participants = new Map(
    conversation.participants.map((participant) => [
      participant.id,
      participant,
    ])
  );
  const timeOf = (time: Date | string) =>
    time instanceof Date
      ? DateTime.fromJSDate(time).toMillis()
      : DateTime.fromISO(time).toMillis();

  return [...conversation.thread]
    .sort((a, b) => timeOf(a.time) - timeOf(b.time))
    .flatMap((message) =>
      (message.media ?? []).map((attachment) => ({
        // Tuple encoding prevents collisions when ids themselves contain a
        // delimiter. Including the conversation keeps selection scoped to it.
        id: JSON.stringify([conversation.id, message.id, attachment.id]),
        conversationId: conversation.id,
        message,
        attachment,
        participant: participants.get(message.participantId),
      }))
    );
}
