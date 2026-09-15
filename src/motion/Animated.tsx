/**
 * `Animated` / `AnimatedPresence` — the ergonomic layer components use.
 *
 * These exist so an individual component never has to branch on whether motion
 * is available. It declares the preset it wants and the CSS classes that stand
 * in when motion is absent; this module picks the element to render.
 *
 * Adding motion to a further component should be a matter of swapping its
 * root `<div>` for an `<Animated>` and naming a preset — no new imports, no
 * new dependency, and no behavior change for apps that have not opted in.
 */

import * as React from 'react';
import { cn } from '../utils/cn';
import { useMotionRuntime, type MotionPresenceProps } from './runtime';
import type { MotionPreset } from './presets';

// =============================================================================
// Animated
// =============================================================================

export interface AnimatedProps extends React.HTMLAttributes<HTMLElement> {
  /** Intrinsic element to render. */
  as?: 'div' | 'nav' | 'span';
  /** Which shared animation recipe to use. */
  preset: MotionPreset;
  /**
   * - `toggle` — element stays mounted and animates between open and closed.
   * - `presence` — element mounts and unmounts; wrap it in `<AnimatedPresence>`
   *   so the exit animation gets a chance to run.
   */
  mode: 'toggle' | 'presence';
  /** Current state. Only read in `toggle` mode. */
  open?: boolean;
  /** Per-preset context value — see the `custom` contract in `presets.ts`. */
  custom?: unknown;
  /**
   * Classes applied **only** when no motion runtime is present. This is where a
   * component's existing CSS transition lives, so the two paths never both try
   * to drive the same property.
   */
  fallbackClassName?: string;
  /**
   * Set `false` to stop this element animating even when a runtime is active.
   *
   * For states where an animated element would be wrong rather than merely
   * unnecessary. Motion writes a `transform` to hold an element at its resting
   * position, and a transformed ancestor becomes the containing block for any
   * `position: fixed` descendant — so an element that is only sometimes
   * animated should opt out the rest of the time.
   *
   * The rendered element type is unaffected, so toggling this does not remount.
   */
  enabled?: boolean;
}

export const Animated = React.forwardRef<HTMLElement, AnimatedProps>(
  function Animated(
    {
      as = 'div',
      preset,
      mode,
      open = false,
      custom,
      className,
      fallbackClassName,
      enabled = true,
      children,
      ...rest
    },
    ref
  ) {
    const runtime = useMotionRuntime();

    // No provider anywhere: a plain element plus the CSS fallback, identical to
    // the markup these components rendered before motion existed. This branch
    // is decided by the module graph, not by state, so it never flips at
    // runtime and cannot cause a remount.
    if (!runtime) {
      const Tag = as as React.ElementType;
      return (
        <Tag ref={ref} className={cn(fallbackClassName, className)} {...rest}>
          {children}
        </Tag>
      );
    }

    const Component =
      as === 'nav' ? runtime.Nav : as === 'span' ? runtime.Span : runtime.Div;

    // Under a provider the element type is always the motion component, even
    // when nothing is animating. Only the props change.
    //
    // Swapping to a native tag here would change the React element type and
    // remount the subtree — discarding consumer state and focus every time the
    // provider is disabled or a component crosses a breakpoint that toggles
    // `enabled`. A motion component with no animation props writes no
    // transform, so opting out this way still avoids creating a containing
    // block for `position: fixed` descendants.
    if (!runtime.enabled || !enabled) {
      return (
        <Component
          ref={ref}
          className={cn(fallbackClassName, className)}
          {...rest}
        >
          {children}
        </Component>
      );
    }

    const motionProps =
      mode === 'toggle'
        ? runtime.toggle(preset, open, custom)
        : runtime.presence(preset, custom);

    return (
      <Component ref={ref} className={className} {...motionProps} {...rest}>
        {children}
      </Component>
    );
  }
);

Animated.displayName = 'Animated';

// =============================================================================
// AnimatedPresence
// =============================================================================

/**
 * Keeps unmounting children on screen long enough to animate out.
 *
 * Without a runtime this is a pass-through, so children disappear immediately —
 * which is exactly what they do today. Children rendered conditionally inside
 * it need a stable `key`.
 */
export function AnimatedPresence({
  children,
  initial,
  onExitComplete,
}: MotionPresenceProps): React.JSX.Element {
  const runtime = useMotionRuntime();

  if (!runtime) {
    return <>{children}</>;
  }

  const { Presence } = runtime;
  return (
    <Presence initial={initial} onExitComplete={onExitComplete}>
      {children}
    </Presence>
  );
}

AnimatedPresence.displayName = 'AnimatedPresence';
