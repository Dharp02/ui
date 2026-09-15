/**
 * `<MotionProvider>` — the opt-in switch.
 *
 * This is the **only** file in the package that imports `motion`, and it is
 * reachable solely through the `@mieweb/ui/motion` entry point. An app that
 * never imports that entry never pulls the library into its bundle, which is
 * what makes this additive for existing consumers.
 *
 * ```tsx
 * import { MotionProvider } from '@mieweb/ui/motion';
 *
 * <MotionProvider>
 *   <App />
 * </MotionProvider>
 * ```
 *
 * Components opted into motion upgrade automatically underneath it. Everything
 * else is untouched.
 */

import * as React from 'react';
import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  domAnimation,
  m,
} from 'motion/react';
import {
  MotionRuntimeContext,
  createPresetPropBuilders,
  type MotionPresenceProps,
  type MotionRuntime,
} from './runtime';

// =============================================================================
// Presence adapter
// =============================================================================

/**
 * Narrows `AnimatePresence` to the surface `MotionRuntime` promises, so the
 * component-facing contract does not grow every time the library's API does.
 */
function Presence({
  children,
  initial = true,
}: MotionPresenceProps): React.JSX.Element {
  return <AnimatePresence initial={initial}>{children}</AnimatePresence>;
}

// =============================================================================
// Provider
// =============================================================================

export interface MotionProviderProps {
  children: React.ReactNode;
  /**
   * Withhold the runtime, forcing every component back onto its CSS path.
   *
   * Intended for test runs: real spring animations make screenshot and
   * interaction assertions timing-dependent, and this keeps a suite
   * deterministic without having to unmount the provider. Safe to flip at
   * runtime — it does not remount the subtree.
   */
  disabled?: boolean;
  /**
   * How to honor the OS "reduce motion" setting.
   *
   * Defaults to `'user'`, which drops transform and layout animations while
   * keeping opacity — the accessible default, and the reason motion should be
   * configured once at the root rather than per component.
   */
  reducedMotion?: 'user' | 'always' | 'never';
}

export function MotionProvider({
  children,
  disabled = false,
  reducedMotion = 'user',
}: MotionProviderProps): React.JSX.Element {
  const runtime = React.useMemo<MotionRuntime>(
    () => ({
      Div: m.div,
      Nav: m.nav,
      Presence,
      ...createPresetPropBuilders(),
    }),
    []
  );

  return (
    // `domAnimation` covers transforms, opacity and exit animations — the whole
    // preset vocabulary — at roughly a fifth of the full bundle. `strict`
    // catches any accidental use of the eagerly-loaded `motion.*` components.
    //
    // `disabled` withholds the runtime rather than skipping these wrappers, so
    // the element tree keeps the same shape either way. Changing shape would
    // make React unmount and remount the whole subtree on every flip, throwing
    // away component state — which breaks toggling motion on a live component
    // and would make the flag unusable mid-test.
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={reducedMotion}>
        <MotionRuntimeContext.Provider value={disabled ? null : runtime}>
          {children}
        </MotionRuntimeContext.Provider>
      </MotionConfig>
    </LazyMotion>
  );
}

MotionProvider.displayName = 'MotionProvider';
