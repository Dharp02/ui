'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import { CoreEditor, type AssetLoad } from '@kerebron/editor';
import { createAssetLoad } from '@kerebron/wasm/web';

import { useIsDarkMode } from '../../hooks/useIsDarkMode';
import { createEditorKits, type CollabConfig } from './editorKits';

export type { CollabConfig } from './editorKits';

const MARKDOWN_TYPE = 'text/x-markdown';

/**
 * The markdown converter's tree-sitter WASM init is not concurrency-safe, so
 * every editor's *first* load queues behind the previous one. Later loads (a
 * `value` change) are free — by then the grammars are warm.
 */
let initialLoadQueue: Promise<unknown> = Promise.resolve();

function queueInitialLoad(load: () => Promise<void>): Promise<void> {
  const queued = initialLoadQueue.catch(() => undefined).then(load);
  initialLoadQueue = queued.catch(() => undefined);
  return queued;
}

export interface RichEditorProps {
  /** Markdown to load. Changing it reloads the editor unless `collab` is set. */
  value?: string;
  /** Called with the editor's markdown content whenever it changes. */
  onChange?: (value: string) => void;
  /** Whether to render the live markdown output preview. Defaults to `false`. */
  showPreview?: boolean;
  /**
   * Enable live collaborative editing (Yjs) for the given room. When set, the
   * editor connects to the `/yjs` websocket relay and every peer in the same
   * `room` co-edits one shared document. Uncontrolled like `value` — remount via
   * `key` to switch rooms.
   */
  collab?: CollabConfig;
  /** Read-only surface: no typing, and the content dims. */
  disabled?: boolean;
  /**
   * Id for the editor host element — an `aria-labelledby`/`aria-describedby`
   * anchor. The host is a `div`, not a labelable control, so a
   * `<label htmlFor>` will not associate; name the editor with `aria-label`
   * or `aria-labelledby` instead.
   */
  id?: string;
  /** Extra classes on the editor surface, beside `kb-component`. */
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  /**
   * Describes the surface (e.g. a composer's prompt). Announced after the name,
   * so it carries hints rather than identity.
   */
  'aria-describedby'?: string;
  /**
   * Where the tree-sitter WASM grammars load from. Defaults to
   * `createAssetLoad('/kerebron-wasm')`; supply your own when the host serves
   * `@kerebron/wasm`'s `assets/` somewhere else.
   */
  assetLoad?: AssetLoad;
}

export interface RichEditorHandle {
  /**
   * The editor's markdown, awaiting the initial load. `onChange` can lag the
   * last keystroke, so read this on submit rather than trusting mirrored state.
   */
  getContent: () => Promise<string>;
  /** Focus the editor, restoring the caret where the writer left it. */
  focus: () => void;
}

/**
 * Markdown editor over Kerebron's `CoreEditor`.
 *
 * The editor mounts into a **disposable child div**: `CoreEditor.destroy()`
 * replaces its host element with a clone, which would strand React's ref (and,
 * under StrictMode's double-mount, leave the live editor detached behind a
 * dead clone).
 */
const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(
  function RichEditor(
    {
      value = '',
      onChange,
      showPreview = false,
      collab,
      disabled = false,
      id,
      className,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      'aria-describedby': ariaDescribedBy,
      assetLoad,
    },
    ref
  ) {
    const isDark = useIsDarkMode();
    const hostRef = useRef<HTMLDivElement>(null);
    const editorInstance = useRef<CoreEditor | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    // Mirrors what the editor last held, so an echo of our own `onChange`
    // doesn't reload the document out from under the caret.
    const valueRef = useRef(value);
    const readyRef = useRef<Promise<void> | null>(null);
    const loadingRef = useRef(false);
    const disabledRef = useRef(disabled);

    const [md, setMd] = useState<string>('');

    useEffect(() => {
      disabledRef.current = disabled;
      editorInstance.current?.view.setProps({
        editable: () => !disabledRef.current,
      });
    }, [disabled]);

    /**
     * Makes the toolbar's dropdown menus work at all, and keeps the selection
     * alive while any menu command runs.
     *
     * Two problems, one listener.
     *
     * 1. **The dropdown rows are inert.** Every row in a pinned dropdown
     *    ("Plain"/"Code", "Heading 1".."Heading 6", "Bullet List"…) renders as a
     *    wrapper holding a `display: none` button plus a visible label, and
     *    `@kerebron/extension-menu` forwards a click on the label to that hidden
     *    button with
     *    `new MouseEvent('mousedown', { view: dntGlobalThis })`. `dntGlobalThis`
     *    is the dnt shim's *Proxy* around `globalThis`, and a Proxy fails
     *    WebIDL's brand check for `Window`, so the constructor throws
     *    ("Failed to convert value to 'Window'") before the forwarded event is
     *    ever dispatched. The command never runs, and because the throw happens
     *    ahead of the menu's own cleanup, the dropdown does not even close.
     *    Reported upstream; until it lands, this listener does the forwarding
     *    itself with a well-formed event and closes the dropdown afterwards, the
     *    way the menu would have.
     *
     * 2. **The selection dies before the command reads it.** A command acts on
     *    the editor's current selection, but the mousedown that triggers it
     *    moves focus out of the contenteditable first, collapsing that
     *    selection. `preventDefault` stops the focus shift; the click still
     *    fires.
     *
     * Bound on `document` in the capture phase, not on the host, because the
     * dropdowns are portaled to `document.body` — outside the host entirely.
     * Scoped so a page with several editors is unaffected: chrome inside our own
     * host always qualifies, portaled chrome only while our view holds focus,
     * which is exactly when the open menu is ours. Synthetic events are ignored
     * so our own forwarded event does not re-enter.
     */
    useEffect(() => {
      const onMenuMouseDown = (event: MouseEvent): void => {
        if (!event.isTrusted) return;
        const target = event.target as HTMLElement | null;
        if (typeof target?.closest !== 'function') return;

        // Clicks that place the caret must behave normally, or the editor
        // cannot be focused or typed into at all.
        if (target.closest('.kb-custom-menu__editor, [contenteditable="true"]'))
          return;

        const chrome = target.closest(
          '.kb-custom-menu, .kb-custom-menu__wrapper, .kb-custom-menu__pinned-dropdown, .kb-custom-menu__overflow-menu, [role="menu"]'
        );
        if (!chrome) return;

        const host = hostRef.current;
        const view = editorInstance.current?.view as
          | { hasFocus?: () => boolean }
          | undefined;
        const ours =
          (host?.contains(chrome) ?? false) || view?.hasFocus?.() === true;
        if (!ours) return;

        event.preventDefault();

        const row = target.closest('.kb-custom-menu__overflow-item');
        const button = row?.querySelector('button');
        if (!button || button === target || button.contains(target)) return;

        // The menu's own handler for this row throws; it must not run.
        event.stopImmediatePropagation();
        button.dispatchEvent(
          new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: window,
          })
        );
        // Closing is the menu's job, and it never got there. Its own state
        // heals on the next open, which removes whatever it still points at.
        document
          .querySelectorAll('.kb-custom-menu__pinned-dropdown')
          .forEach((dropdown) => dropdown.remove());
      };

      document.addEventListener('mousedown', onMenuMouseDown, true);
      return () =>
        document.removeEventListener('mousedown', onMenuMouseDown, true);
    }, []);

    useEffect(() => {
      // In collab mode the CRDT owns the content; reloading would fight it.
      if (collab || value === valueRef.current) return;
      valueRef.current = value;
      const editor = editorInstance.current;
      if (!editor) return;

      loadingRef.current = true;
      void editor
        .loadDocumentText(MARKDOWN_TYPE, value)
        .catch(() => undefined)
        .finally(() => {
          if (editorInstance.current === editor) loadingRef.current = false;
        });
      // `collab` is fixed for the lifetime of the instance.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    useEffect(() => {
      if (!hostRef.current) return;
      const host = hostRef.current;

      // Set on cleanup so async continuations (kit loading and the
      // `loadDocumentText` chain) don't touch the editor after `destroy()`.
      let disposed = false;
      let editor: CoreEditor | null = null;

      const mount = document.createElement('div');
      host.appendChild(mount);

      // Listen to transactions and update markdown preview
      const onTransaction = async () => {
        // Programmatic loads are not edits — reporting them would echo the
        // caller's own `value` back through `onChange`.
        if (loadingRef.current || !editorInstance.current) return;

        try {
          const buffer =
            await editorInstance.current.saveDocument(MARKDOWN_TYPE);
          const markdown = new globalThis.TextDecoder().decode(buffer);
          if (disposed) return;
          valueRef.current = markdown;
          setMd(markdown);
          onChangeRef.current?.(markdown);
        } catch (err) {
          console.error('Failed to save markdown:', err);
        }
      };

      // Initialize the editor. Both modes drop the teardown-unsafe extensions;
      // collaborative mode additionally swaps `history` for the Yjs CRDT sync
      // and lazy-loads the Yjs kit (see `editorKits.ts` for why).
      const setup = async () => {
        const editorKits = await createEditorKits(collab);
        if (disposed) return;

        editor = CoreEditor.create({
          element: mount,
          uri: 'file:///untitled.md',
          assetLoad: assetLoad ?? createAssetLoad('/kerebron-wasm'),
          editorKits,
          readOnly: disabledRef.current,
        });

        editorInstance.current = editor;
        // The contenteditable surface has no implicit ARIA role, so labeling
        // attributes are only permitted alongside an explicit textbox role.
        const surfaceAttributes =
          ariaLabel || ariaLabelledBy
            ? {
                role: 'textbox',
                'aria-multiline': 'true',
                ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
                ...(ariaLabelledBy
                  ? { 'aria-labelledby': ariaLabelledBy }
                  : {}),
                ...(ariaDescribedBy
                  ? { 'aria-describedby': ariaDescribedBy }
                  : {}),
              }
            : null;
        editor.view.setProps({
          editable: () => !disabledRef.current,
          ...(surfaceAttributes ? { attributes: surfaceAttributes } : {}),
        });
        editor.addEventListener('transaction', onTransaction);

        // Seed initial content, then populate the preview once on mount.
        //
        // In collaborative mode we still load the local markdown first, then
        // join the room: the Yjs binding seeds an *empty* shared document from
        // this content on the first join, and overwrites the editor with the
        // shared content when the room already has edits — so the stored
        // markdown is the starting point without ever double-inserting.
        const joinRoom = () => {
          if (collab && editor && !disposed) {
            (
              editor.run as Record<string, (...args: unknown[]) => boolean>
            ).changeRoom?.(collab.room);
            reseedWhenRoomStaysEmpty();
          }
        };

        // The Yjs binding is supposed to seed an empty room from the local
        // content, but the sync import can land as an overwrite that blanks
        // the just-loaded seed (observed with extension-yjs 0.8.x). Heal it:
        // once the join settles, an empty document with a non-empty seed
        // means nobody's content won — reload the seed, which the binding
        // then pushes into the room. Joiners pass no value, so exactly one
        // participant ever does this.
        const seed = valueRef.current;
        const reseedWhenRoomStaysEmpty = () => {
          if (!seed) return;
          const check = async (attempt: number) => {
            if (disposed || !editorInstance.current) return;
            try {
              const buffer =
                await editorInstance.current.saveDocument(MARKDOWN_TYPE);
              const current = new globalThis.TextDecoder()
                .decode(buffer)
                .trim();
              if (disposed || !editorInstance.current) return;
              if (current) return; // somebody's content arrived — done
              if (attempt >= 2) {
                await editorInstance.current.loadDocumentText(
                  MARKDOWN_TYPE,
                  seed
                );
                return;
              }
              setTimeout(() => void check(attempt + 1), 300);
            } catch {
              // A failed probe must not break the editor; the room stays as-is.
            }
          };
          setTimeout(() => void check(0), 300);
        };

        if (valueRef.current) {
          await queueInitialLoad(() =>
            editor!.loadDocumentText(MARKDOWN_TYPE, valueRef.current)
          );
          await onTransaction();
          joinRoom();
        } else {
          void onTransaction();
          joinRoom();
        }
      };

      readyRef.current = setup().catch((err) =>
        console.error('Failed to set up editor:', err)
      );

      // Cleanup on unmount
      return () => {
        disposed = true;
        editorInstance.current = null; // makes onTransaction's guard effective
        editor?.removeEventListener('transaction', onTransaction);
        editor?.destroy();
        readyRef.current = null;
        host.replaceChildren();
      };
      // Initial `value`/`collab` are intentionally only applied on mount
      // (uncontrolled). Remount via `key` to switch rooms.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        getContent: async (): Promise<string> => {
          await readyRef.current;
          const editor = editorInstance.current;
          if (!editor) return valueRef.current;
          const buffer = await editor.saveDocument(MARKDOWN_TYPE);
          const markdown = new globalThis.TextDecoder().decode(buffer);
          valueRef.current = markdown;
          return markdown;
        },
        focus: (): void => {
          const apply = (): void => {
            const view = editorInstance.current?.view as
              | { focus?: () => void }
              | undefined;
            if (view?.focus) {
              view.focus();
              return;
            }
            hostRef.current
              ?.querySelector<HTMLElement>('[contenteditable="true"], textarea')
              ?.focus();
          };
          // Callers focus on mount; the editor may still be loading its kits.
          if (editorInstance.current) apply();
          else void readyRef.current?.then(apply);
        },
      }),
      []
    );

    return (
      <div>
        <div>
          <div
            ref={hostRef}
            id={id}
            className={[
              'kb-component',
              isDark ? 'kb-component--dark' : '',
              className ?? '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-disabled={disabled || undefined}
            style={{
              isolation: 'isolate',
              opacity: disabled ? 0.65 : undefined,
              pointerEvents: disabled ? 'none' : undefined,
            }}
          />
        </div>

        {showPreview && (
          <div>
            <div>
              <h5>Markdown Output</h5>
              <pre>{md}</pre>
            </div>
          </div>
        )}
      </div>
    );
  }
);

RichEditor.displayName = 'RichEditor';

export { RichEditor };
