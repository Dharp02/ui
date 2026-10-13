import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../../test/test-utils';
import { Tooltip, type TooltipPlacement } from './Tooltip';

// jsdom has no layout: fake the wrapper (trigger) and tooltip rects, then fire
// a resize so `calculatePosition` re-runs synchronously with the mocked
// geometry (the initial calculation runs in a rAF with zero-size rects).
const TRIGGER = { left: 500, right: 540, top: 300, bottom: 320 };
const TOOLTIP = { width: 100, height: 30 };
const OFFSET = 8;

function renderOpenTooltip(placement: TooltipPlacement, rtl = false) {
  renderWithTheme(
    <Tooltip content="tip" placement={placement} open>
      <button>trigger</button>
    </Tooltip>
  );
  // Hidden until positioned (visibility: hidden while `position` is null).
  const tooltip = screen.getByRole('tooltip', { hidden: true });
  const wrapper = screen.getByRole('button', { name: 'trigger' })
    .parentElement as HTMLElement;
  if (rtl) {
    // jsdom has no [dir] cascade — set direction on the element isRtl reads.
    wrapper.setAttribute('dir', 'rtl');
    wrapper.style.direction = 'rtl';
  }
  wrapper.getBoundingClientRect = () =>
    ({
      ...TRIGGER,
      width: TRIGGER.right - TRIGGER.left,
      height: TRIGGER.bottom - TRIGGER.top,
      x: TRIGGER.left,
      y: TRIGGER.top,
      toJSON: () => ({}),
    }) as ReturnType<HTMLElement['getBoundingClientRect']>;
  tooltip.getBoundingClientRect = () =>
    ({
      ...TOOLTIP,
      left: 0,
      right: TOOLTIP.width,
      top: 0,
      bottom: TOOLTIP.height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as ReturnType<HTMLElement['getBoundingClientRect']>;
  fireEvent(window, new Event('resize'));
  return tooltip;
}

const LEFT_OF_TRIGGER = `${TRIGGER.left - TOOLTIP.width - OFFSET}px`; // 392px
const RIGHT_OF_TRIGGER = `${TRIGGER.right + OFFSET}px`; // 548px

describe('Tooltip logical placements', () => {
  it('places `start` on the left in LTR', () => {
    const tooltip = renderOpenTooltip('start');
    expect(tooltip.style.left).toBe(LEFT_OF_TRIGGER);
  });

  it('places `start` on the right in RTL', () => {
    const tooltip = renderOpenTooltip('start', true);
    expect(tooltip.style.left).toBe(RIGHT_OF_TRIGGER);
  });

  it('places `end` on the right in LTR', () => {
    const tooltip = renderOpenTooltip('end');
    expect(tooltip.style.left).toBe(RIGHT_OF_TRIGGER);
  });

  it('places `end` on the left in RTL', () => {
    const tooltip = renderOpenTooltip('end', true);
    expect(tooltip.style.left).toBe(LEFT_OF_TRIGGER);
  });

  it('keeps physical `left` unchanged in RTL', () => {
    const tooltip = renderOpenTooltip('left', true);
    expect(tooltip.style.left).toBe(LEFT_OF_TRIGGER);
  });
});
