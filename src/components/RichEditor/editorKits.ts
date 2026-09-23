/**
 * Editor kit assembly for {@link RichEditor}, for both plain and collaborative
 * (Yjs) mode.
 *
 * Both modes start from {@link AdvancedEditorKit} and drop the extensions that
 * are unsafe for our usage — see {@link unsafeExtensions} — then collaborative
 * mode adds the Yjs pieces on top.
 *
 * The Yjs pieces live in `collabKit.ts` behind a dynamic `import()`, so
 * `@kerebron/extension-yjs`, `yjs` and `y-protocols` remain truly optional
 * peers — plain-mode consumers never load them.
 */
import type { EditorKit } from '@kerebron/editor';
import { AdvancedEditorKit } from '@kerebron/editor-kits/AdvancedEditorKit';

export interface CollabConfig {
  /** Room id — one shared document per room (e.g. a post id). */
  room: string;
  /**
   * WebSocket base URL for the Yjs relay. Defaults to
   * `<ws|wss>://<location.host>/yjs`. The room id is appended by the provider.
   */
  wsUrl?: string;
  /** Extra query params for the socket (e.g. `{ token }` for auth). */
  params?: Record<string, string>;
  /**
   * Who this editor is, published on awareness (`kerebron:user`) so peers see
   * a named, coloured cursor. Without it remote cursors do not render — the
   * position plugin skips awareness states that carry no user — and the
   * `id` is what the cursor colour is derived from (kerebron's `User` shape).
   */
  user?: { id: string; name: string; color?: string };
  /**
   * Custom WebSocket implementation handed to the Yjs provider — e.g. a
   * loopback socket for demos/tests, or a polyfill outside the browser.
   * Defaults to `globalThis.WebSocket`.
   */
  WebSocketPolyfill?: typeof globalThis.WebSocket;
}

/**
 * Extensions dropped from {@link AdvancedEditorKit}, and why.
 *
 * `autocomplete` and `hover` debounce their DOM handlers (200ms) and then call
 * `dispatchMeta`, which reads `this.editor.state` with no guard that the editor
 * is still alive. Any teardown or document swap inside that debounce window
 * lands the deferred call on a dead view and throws
 * `null.matchesNode()` inside ProseMirror's `EditorView.updateStateInner`,
 * leaving the view permanently broken. Two ways to hit it:
 *   - remount (e.g. a `key` change) while the pointer is over the editor, which
 *     fires the debounced `onMouseLeave` after the view is destroyed;
 *   - a Yjs remote update replacing the document tree under a pending callback.
 * The first applies to *every* editor, so both extensions come out in both
 * modes. No functional cost — autocomplete popups and node-hover tooltips are
 * compositor conveniences, not required for editing.
 *
 * `history` is collab-only: ExtensionYjs supplies its own CRDT-aware undo/redo
 * and the editor throws `Extension conflict: yjs vs history` if both are
 * present. Plain mode keeps it, so undo/redo still works there.
 *
 * `dev_toolkit` binds Ctrl+` to `prosemirror-dev-toolkit`, a debugging panel
 * that lets anyone read and rewrite the document's internal state. It is an
 * authoring surface in shipped products, not a developer console, and it drags
 * ~415 KB of source into the consumer's bundle whether or not it is ever
 * opened. Consumers who want it can add `ExtensionDevToolkit` themselves.
 */
const unsafeExtensions = ['autocomplete', 'hover', 'dev_toolkit'] as const;

/**
 * Formatting this editor must not offer, because its own markdown
 * serialization cannot carry it.
 *
 * {@link RichEditor} reads and writes `text/x-markdown`, and CommonMark has no
 * representation for underline, highlight, superscript, subscript or block
 * alignment. Applied, they survive in the live document and are then silently
 * dropped the moment the content round-trips — underline is the worst case, as
 * it comes back as *italic*, changing what the writer said rather than merely
 * losing it.
 *
 * These are dropped as extensions rather than hidden as toolbar buttons so the
 * keyboard shortcuts (Mod-u and friends) go with them: `buildMenu` only builds
 * an item when the mark is in the schema, so removing the mark removes the
 * button, the shortcut and the ability to produce content that cannot be saved.
 */
const unsupportedByMarkdown = [
  'underline',
  'highlight',
  'superscript',
  'subscript',
] as const;

/**
 * Toolbar items removed by title rather than by dropping their extension.
 *
 * Block alignment is the same silent-loss problem as {@link
 * unsupportedByMarkdown}, but it cannot be removed the same way: `buildMenu`
 * shows the alignment group whenever the *paragraph node* carries a `textAlign`
 * attribute, which `NodeParagraph` declares itself, so dropping
 * `ExtensionTextAlign` would leave four buttons wired to commands that no
 * longer exist. The extension stays; its buttons go.
 */
const unsupportedMenuItems = [
  'Align left',
  'Align center',
  'Align right',
  'Justify',
] as const;

/**
 * {@link AdvancedEditorKit} minus {@link unsafeExtensions} (and, for collab
 * mode, minus `history`), with {@link unsupportedByMarkdown} pruned out of the
 * nested basic-editor kit.
 */
class SafeAdvancedEditorKit implements EditorKit {
  name = 'advanced-editor';
  constructor(private readonly forCollab: boolean) {}

  getExtensions() {
    const dropped: string[] = [...unsafeExtensions];
    if (this.forCollab) dropped.push('history');

    return new AdvancedEditorKit()
      .getExtensions()
      .filter(
        (extension) =>
          !('name' in extension && dropped.includes(extension.name))
      )
      .map((extension) => pruneUnsupportedMarks(extension))
      .map((extension) => pruneUnsupportedMenuItems(extension));
  }
}

/** A menu entry as `buildMenu` produces it — `MenuItem`s carry a `spec`. */
interface MenuEntry {
  spec?: { title?: string };
}

/**
 * Narrows the toolbar to items whose result can actually be saved, by giving
 * `ExtensionCustomMenu` the `modifyMenu` hook it already supports. Configured
 * on the instance the kit built rather than by constructing our own, so
 * `@kerebron/extension-menu` stays out of this package's dependencies.
 */
function pruneUnsupportedMenuItems<T>(extension: T): T {
  const menu = extension as {
    name?: string;
    config?: { modifyMenu?: (content: MenuEntry[][]) => MenuEntry[][] };
  };
  if (menu?.name !== 'customMenu') return extension;

  menu.config = {
    ...menu.config,
    modifyMenu: (content) =>
      content
        .map((group) =>
          group.filter(
            (item) =>
              !(unsupportedMenuItems as readonly string[]).includes(
                item?.spec?.title ?? ''
              )
          )
        )
        .filter((group) => group.length > 0),
  };
  return extension;
}

/**
 * The marks live one level down: `ExtensionBasicEditor` is a single named
 * extension whose `requires` array holds the individual mark/attribute
 * extensions, so the top-level name filter above cannot reach them. Each
 * `getExtensions()` call builds a fresh array of fresh instances, so narrowing
 * `requires` here affects only the kit being assembled.
 */
function pruneUnsupportedMarks<T>(extension: T): T {
  const nested = extension as { name?: string; requires?: { name?: string }[] };
  if (nested?.name !== 'basic-editor' || !Array.isArray(nested.requires)) {
    return extension;
  }
  nested.requires = nested.requires.filter(
    (required) =>
      !required?.name ||
      !(unsupportedByMarkdown as readonly string[]).includes(required.name)
  );
  return extension;
}

/** MarkYChange + ExtensionYjs live in `collabKit.ts` (lazy-loaded). */

/**
 * Build the editor kits for a session. Pass `config` to join a collaborative
 * room; omit it for a plain local editor.
 *
 * Async because collaborative mode lazy-loads the Yjs kit (and its optional
 * peer deps) on first use; plain mode resolves immediately.
 */
export async function createEditorKits(
  config?: CollabConfig
): Promise<EditorKit[]> {
  if (!config) return [new SafeAdvancedEditorKit(false)];

  const { HuddleYjsKit, defaultWsUrl } = await import('./collabKit');
  const url = config.wsUrl ?? defaultWsUrl();
  return [
    new SafeAdvancedEditorKit(true),
    new HuddleYjsKit(
      url,
      config.params ?? {},
      config.WebSocketPolyfill,
      config.user
    ),
  ];
}
