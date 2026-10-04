import { Button } from '../Button';
import { ButtonGroup } from '../ButtonGroup';
import { MediaPlayer } from '../MediaPlayer';
import type { SuperChatMediaAttachment } from './types';

/** Thread previews reuse the same native transport as the full media feed. */
export function MessageMedia({
  attachment,
  onOpen,
  openLabel,
}: {
  attachment: SuperChatMediaAttachment;
  onOpen?: () => void;
  openLabel: string;
}) {
  return (
    <div
      data-slot="superchat-message-media"
      className="mt-3 flex w-72 max-w-full flex-col gap-2"
    >
      {attachment.title && (
        <p className="text-sm font-medium">{attachment.title}</p>
      )}
      {attachment.kind === 'image' ? (
        <img
          src={attachment.src}
          alt={attachment.alt ?? attachment.title ?? ''}
          loading="lazy"
          className="max-h-72 w-full rounded-lg object-contain"
        />
      ) : attachment.kind === 'video' || attachment.kind === 'audio' ? (
        <MediaPlayer
          src={attachment.src}
          kind={attachment.kind}
          poster={attachment.poster}
          aria-label={attachment.alt ?? attachment.title ?? openLabel}
          className="max-h-72"
        />
      ) : attachment.poster ? (
        <img
          src={attachment.poster}
          alt={attachment.alt ?? attachment.title ?? ''}
          loading="lazy"
          className="max-h-72 w-full rounded-lg object-contain"
        />
      ) : null}
      {attachment.caption && <p className="text-sm">{attachment.caption}</p>}
      {onOpen && (
        <ButtonGroup>
          <Button variant="outline" size="sm" onClick={onOpen}>
            {openLabel}
          </Button>
        </ButtonGroup>
      )}
    </div>
  );
}
