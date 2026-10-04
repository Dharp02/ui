import * as React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaFeed, type MediaFeedMedia, type MediaFeedProps } from './index';

interface Update {
  id: string;
  title: string;
  media: MediaFeedMedia;
}

const updates: Update[] = [
  {
    id: 'first',
    title: 'First update',
    media: { kind: 'video', src: 'first.mp4' },
  },
  {
    id: 'second',
    title: 'Second update',
    media: { kind: 'video', src: 'second.mp4' },
  },
  {
    id: 'third',
    title: 'Third update',
    media: { kind: 'video', src: 'third.mp4' },
  },
];

const accessors = {
  getId: (item: Update) => item.id,
  getMedia: (item: Update) => item.media,
  getTitle: (item: Update) => item.title,
};

const observers: IntersectionObserverMock[] = [];

/** The test controls visibility instead of relying on jsdom's absent layout. */
class IntersectionObserverMock implements IntersectionObserver {
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[];
  readonly targets: Element[] = [];

  constructor(
    readonly callback: globalThis.IntersectionObserverCallback,
    options: globalThis.IntersectionObserverInit = {}
  ) {
    this.root = options.root ?? null;
    this.rootMargin = options.rootMargin ?? '0px';
    this.thresholds = Array.isArray(options.threshold)
      ? options.threshold
      : [options.threshold ?? 0];
    observers.push(this);
  }

  observe(target: Element) {
    if (!this.targets.includes(target)) this.targets.push(target);
  }
  unobserve(target: Element) {
    const index = this.targets.indexOf(target);
    if (index !== -1) this.targets.splice(index, 1);
  }
  disconnect() {
    this.targets.length = 0;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function feedVisibility(visible: boolean) {
  const viewportObserver = observers.find(
    (candidate) => candidate.root === null && candidate.targets.length === 1
  );
  if (viewportObserver) {
    const target = viewportObserver.targets[0];
    act(() =>
      viewportObserver.callback(
        [
          {
            target,
            isIntersecting: visible,
            intersectionRatio: visible ? 1 : 0,
            boundingClientRect: target.getBoundingClientRect(),
            intersectionRect: target.getBoundingClientRect(),
            rootBounds: null,
            time: 0,
          },
        ],
        viewportObserver
      )
    );
  }
}

function visibility(ratios: number[]) {
  feedVisibility(true);
  const observer = [...observers]
    .reverse()
    .find((candidate) => candidate.targets.length === ratios.length);
  expect(observer, 'the feed observes each item').toBeDefined();
  const entries = observer!.targets.map((target, index) => ({
    target,
    isIntersecting: ratios[index] > 0,
    intersectionRatio: ratios[index],
    boundingClientRect: target.getBoundingClientRect(),
    intersectionRect: target.getBoundingClientRect(),
    rootBounds: null,
    time: 0,
  }));
  act(() => observer!.callback(entries, observer!));
}

function provider(
  _media: MediaFeedMedia,
  context: Parameters<NonNullable<MediaFeedProps<Update>['renderMedia']>>[1]
) {
  return (
    <div role="img" aria-label={`${context.item.title} player`}>
      {context.active ? 'Playing' : 'Stopped'} {context.item.title}
    </div>
  );
}

function renderFeed(props: Partial<MediaFeedProps<Update>> = {}) {
  return render(<MediaFeed items={updates} {...accessors} {...props} />);
}

let pageVisible: boolean;
let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  observers.length = 0;
  pageVisible = true;
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() =>
    pageVisible ? 'visible' : 'hidden'
  );
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => !pageVisible);
  play = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', {
        configurable: true,
        value: false,
      });
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    });
  pause = vi
    .spyOn(HTMLMediaElement.prototype, 'pause')
    .mockImplementation(function (this: HTMLMediaElement) {
      if (!this.paused) {
        Object.defineProperty(this, 'paused', {
          configurable: true,
          value: true,
        });
        this.dispatchEvent(new Event('pause'));
      }
    });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(() => {
  // Keep browser mocks installed while unmount effects stop their players.
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('MediaFeed', () => {
  it('moves the only playing native clip to the most visible item', async () => {
    const { container } = renderFeed();
    visibility([0.9, 0.1, 0]);
    const clips = [...container.querySelectorAll('video')];
    await waitFor(() => expect(clips[0].paused).toBe(false));
    expect(clips.filter((clip) => !clip.paused)).toEqual([clips[0]]);

    visibility([0.1, 0.9, 0]);
    await waitFor(() => expect(clips[1].paused).toBe(false));
    expect(clips.filter((clip) => !clip.paused)).toEqual([clips[1]]);
    expect(pause).toHaveBeenCalled();
  });

  it('keeps uncontrolled selection attached to identity when records reorder', () => {
    const onActiveItemChange = vi.fn();
    const { rerender } = renderFeed({
      defaultActiveItemId: 'second',
      onActiveItemChange,
      renderMedia: provider,
    });
    visibility([0, 0.9, 0]);
    expect(
      screen.getByRole('article', { name: 'Second update' })
    ).toHaveAttribute('data-active', 'true');
    rerender(
      <MediaFeed
        items={[updates[2], updates[1], updates[0]]}
        {...accessors}
        defaultActiveItemId="second"
        onActiveItemChange={onActiveItemChange}
        renderMedia={provider}
      />
    );
    expect(
      screen.getByRole('article', { name: 'Second update' })
    ).toHaveAttribute('data-active', 'true');
    expect(onActiveItemChange).not.toHaveBeenCalled();
  });

  it('reports controlled selection requests and waits for the host update', () => {
    const onActiveItemChange = vi.fn();
    const { rerender } = renderFeed({
      activeItemId: 'first',
      onActiveItemChange,
      renderMedia: provider,
    });
    visibility([0.1, 0.9, 0]);
    expect(onActiveItemChange).toHaveBeenLastCalledWith(updates[1]);
    expect(
      screen.getByRole('article', { name: 'First update' })
    ).toHaveAttribute('tabindex', '0');
    expect(
      screen.getByRole('article', { name: 'Second update' })
    ).toHaveAttribute('tabindex', '-1');
    rerender(
      <MediaFeed
        items={updates}
        {...accessors}
        activeItemId="second"
        onActiveItemChange={onActiveItemChange}
        renderMedia={provider}
      />
    );
    expect(
      screen.getByRole('article', { name: 'Second update' })
    ).toHaveAttribute('data-active', 'true');
  });

  it('scopes arrow navigation to the feed and preserves embedded controls', () => {
    const onActiveItemChange = vi.fn();
    render(
      <>
        <button>Outside action</button>
        <MediaFeed
          items={updates}
          {...accessors}
          renderMedia={provider}
          onActiveItemChange={onActiveItemChange}
          renderActions={(item) => (
            <>
              <input aria-label={`${item.title} reply`} />
              <button>React to {item.title}</button>
            </>
          )}
        />
      </>
    );

    const outside = screen.getByRole('button', { name: 'Outside action' });
    outside.focus();
    fireEvent.keyDown(outside, { key: 'ArrowDown' });
    const input = screen.getByRole('textbox', { name: 'First update reply' });
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const action = screen.getByRole('button', {
      name: 'React to First update',
    });
    action.focus();
    fireEvent.keyDown(action, { key: 'ArrowDown' });
    expect(onActiveItemChange).not.toHaveBeenCalled();

    const feed = screen.getByRole('feed');
    feed.focus();
    fireEvent.keyDown(feed, { key: 'ArrowDown' });
    expect(onActiveItemChange).toHaveBeenLastCalledWith(updates[1]);
    expect(
      screen.getByRole('article', { name: 'Second update' })
    ).toHaveAttribute('tabindex', '0');
  });

  it('pauses native media when the document is hidden and resumes when visible', async () => {
    const { container } = renderFeed();
    visibility([0.9, 0.1, 0]);
    const clips = [...container.querySelectorAll('video')];
    await waitFor(() => expect(clips[0].paused).toBe(false));

    pageVisible = false;
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(clips.every((clip) => clip.paused)).toBe(true));
    pageVisible = true;
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(clips[0].paused).toBe(false));
    expect(clips.filter((clip) => !clip.paused)).toEqual([clips[0]]);
  });

  it('pauses the current clip when the entire host feed leaves the page viewport', async () => {
    const { container } = renderFeed();
    visibility([0.9, 0.1, 0]);
    const clips = [...container.querySelectorAll('video')];
    await waitFor(() => expect(clips[0].paused).toBe(false));
    feedVisibility(false);
    await waitFor(() => expect(clips.every((clip) => clip.paused)).toBe(true));
    feedVisibility(true);
    await waitFor(() => expect(clips[0].paused).toBe(false));
  });

  it('pauses the inline player for fullscreen and restores trigger focus on Escape', async () => {
    const { container } = renderFeed();
    visibility([0.9, 0.1, 0]);
    const inline = container.querySelector('video') as HTMLVideoElement;
    await waitFor(() => expect(inline.paused).toBe(false));
    const trigger = within(
      screen.getByRole('article', { name: 'First update' })
    ).getByRole('button', { name: 'Open fullscreen' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog');
    const fullscreen = dialog.querySelector('video') as HTMLVideoElement;
    await waitFor(() => expect(fullscreen.paused).toBe(false));
    expect(inline.paused).toBe(true);
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(trigger).toHaveFocus();
    await waitFor(() => expect(inline.paused).toBe(false));
  });

  it('passes provider renderers one active item and suspends all inline renderers for fullscreen', () => {
    renderFeed({ renderMedia: provider });
    visibility([0.1, 0.9, 0]);
    const inlineFeed = screen.getByRole('feed');
    expect(
      screen.getByRole('img', { name: 'First update player' })
    ).toHaveTextContent('Stopped');
    expect(
      screen.getByRole('img', { name: 'Second update player' })
    ).toHaveTextContent('Playing');
    expect(
      screen.getByRole('img', { name: 'Third update player' })
    ).toHaveTextContent('Stopped');

    fireEvent.click(
      within(screen.getByRole('article', { name: 'Second update' })).getByRole(
        'button',
        { name: 'Open fullscreen' }
      )
    );
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('img', { name: 'Second update player' })
    ).toHaveTextContent('Playing');
    expect(
      within(inlineFeed)
        .getAllByRole('img')
        .every((player) => player.textContent?.startsWith('Stopped'))
    ).toBe(true);
  });

  it('continues native playback from the shared position across fullscreen and back', async () => {
    const { container } = renderFeed();
    visibility([0.9, 0.1, 0]);
    const inline = container.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(inline, 'readyState', {
      configurable: true,
      value: 1,
    });
    fireEvent.loadedMetadata(inline);
    inline.currentTime = 6;
    fireEvent.timeUpdate(inline);
    fireEvent.click(
      within(screen.getByRole('article', { name: 'First update' })).getByRole(
        'button',
        { name: 'Open fullscreen' }
      )
    );
    const fullscreen = screen
      .getByRole('dialog')
      .querySelector('video') as HTMLVideoElement;
    Object.defineProperty(fullscreen, 'readyState', {
      configurable: true,
      value: 1,
    });
    fireEvent.loadedMetadata(fullscreen);
    expect(fullscreen.currentTime).toBe(6);
    fullscreen.currentTime = 12;
    fireEvent.timeUpdate(fullscreen);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(inline.currentTime).toBe(12);
  });

  it('shows localized empty, loading, and retry states without mounting players', async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    const props = {
      labels: {
        empty: 'No updates',
        loading: 'Fetching updates',
        retry: 'Reconnect',
      },
      onRetry,
    };
    const { container, rerender } = renderFeed({ ...props, items: [] });
    expect(screen.getByText('No updates')).toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
    rerender(<MediaFeed items={updates} {...accessors} {...props} loading />);
    expect(screen.getByText('Fetching updates')).toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
    rerender(
      <MediaFeed items={updates} {...accessors} {...props} error="Offline" />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Offline');
    expect(container.querySelector('video')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    await waitFor(() => expect(onRetry).toHaveBeenCalledOnce());
  });

  it('keeps a manual play control when autoplay is blocked', async () => {
    play.mockImplementation(() =>
      Promise.reject(
        new globalThis.DOMException('Gesture required', 'NotAllowedError')
      )
    );
    renderFeed({
      labels: { play: 'Start clip', blockedAutoplay: 'Tap to start' },
    });
    visibility([0.9, 0.1, 0]);
    await waitFor(() =>
      expect(screen.getByText('Tap to start')).toBeInTheDocument()
    );
    expect(
      within(screen.getByRole('article', { name: 'First update' })).getByRole(
        'button',
        { name: 'Start clip' }
      )
    ).toBeInTheDocument();
  });

  it('retries a failed native clip and resumes only that active item', async () => {
    const { container } = renderFeed({
      labels: { mediaError: 'Clip unavailable', retry: 'Reload clip' },
    });
    visibility([0.9, 0.1, 0]);
    const failedClip = container.querySelector('video') as HTMLVideoElement;
    await waitFor(() => expect(failedClip.paused).toBe(false));
    fireEvent.error(failedClip);
    expect(screen.getByRole('alert')).toHaveTextContent('Clip unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Reload clip' }));
    await waitFor(() => {
      const clips = [...container.querySelectorAll('video')];
      expect(clips).toHaveLength(3);
      expect(clips[0]).not.toBe(failedClip);
      expect(clips[0].paused).toBe(false);
      expect(clips.filter((clip) => !clip.paused)).toEqual([clips[0]]);
    });
  });

  it('suppresses automatic playback for reduced motion while keeping manual playback available', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
    renderFeed();
    visibility([0.9, 0.1, 0]);
    expect(play).not.toHaveBeenCalled();
    const firstItem = screen.getByRole('article', { name: 'First update' });
    fireEvent.click(within(firstItem).getByRole('button', { name: 'Play' }));
    expect(play).toHaveBeenCalledOnce();
  });

  it('stops a stale playback attempt that completes after the item became inactive', async () => {
    const attempts: { element: HTMLMediaElement; start: () => void }[] = [];
    play.mockImplementation(function (this: HTMLMediaElement) {
      return new Promise<void>((resolve) => {
        attempts.push({
          element: this,
          start: () => {
            Object.defineProperty(this, 'paused', {
              configurable: true,
              value: false,
            });
            this.dispatchEvent(new Event('play'));
            resolve();
          },
        });
      });
    });
    renderFeed();
    visibility([0.9, 0.1, 0]);
    expect(attempts).toHaveLength(1);
    visibility([0.1, 0.9, 0]);
    expect(attempts).toHaveLength(2);
    await act(async () => attempts[0].start());
    expect(attempts[0].element.paused).toBe(true);
    await act(async () => attempts[1].start());
    expect(attempts[1].element.paused).toBe(false);
  });
});
