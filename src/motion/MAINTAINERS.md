# Motion — Maintainer Notes

> **Provider notes** — how to _change_ the motion layer. Consumers should read
> the [Foundations/Motion](MotionProvider.stories.tsx) story. General
> conventions: [CONTRIBUTING.md](../../CONTRIBUTING.md).

## What's in here

The opt-in animation layer behind `@mieweb/ui/motion`. It upgrades supporting
components from CSS transitions to spring-driven motion without making the
`motion` library a cost for anyone who hasn't asked for it.

| File                                     | Ships in       | Imports `motion`? |
| ---------------------------------------- | -------------- | ----------------- |
| [presets.ts](presets.ts)                 | main entry     | no                |
| [runtime.ts](runtime.ts)                 | main entry     | no                |
| [Animated.tsx](Animated.tsx)             | main entry     | no                |
| [index.ts](index.ts)                     | main entry     | no                |
| [MotionProvider.tsx](MotionProvider.tsx) | `/motion` only | **yes**           |
| [entry.ts](entry.ts)                     | `/motion` only | via the provider  |

## Design contract (don't break these)

- **`MotionProvider.tsx` is the only file that may import `motion`.** The opt-in
  is resolved in the module graph, not by a prop — that is the entire reason the
  dependency can stay optional. The moment anything reachable from `src/index.ts`
  imports it, every consumer pays for it and this design is gone.
  Verify after any change to the entry layout:

  ```sh
  npm run build && grep -rl "motion/react" dist   # must match only dist/motion.*
  ```

- **`null` is the normal case.** `useMotionRuntime()` returns `null` whenever the
  app hasn't opted in. Components must keep a CSS path that looks finished on its
  own; motion is an enhancement, never a requirement.

- **Components depend on `MotionRuntime`, not on a library.** Keep the interface
  small (element factories, a presence wrapper, prop builders) so swapping or
  dropping `motion` stays a one-file change.

- **Every preset is an open/closed variant pair**, so one definition serves both
  `toggle` (stays mounted) and `presence` (mounts/unmounts) usage.

## Gotchas

- **The context lives on `globalThis` under `Symbol.for(...)`, deliberately.**
  `@mieweb/ui` and `@mieweb/ui/motion` are separate tsup entries and **CJS cannot
  code-split**, so a module-local `createContext` would be duplicated across
  bundles. Components would then read a different context than the provider
  writes, animations would never turn on, and there would be **no error message**
  to explain it. A duplicated install of the package fails the same way. Do not
  "simplify" this back to a module-local const.

- **Motion writes a `transform` even at rest.** A transformed ancestor becomes
  the containing block for `position: fixed` descendants, so an element that is
  only _sometimes_ animated must pass `enabled={false}` the rest of the time.
  `Sidebar` does this on desktop. Watch for it on any component that can contain
  arbitrary consumer children.

- **CSS keyframes and motion must never drive the same property.** Put a
  component's existing transition in `fallbackClassName`, which `Animated` only
  applies when there's no runtime. `Modal` shows the pattern: its
  `data-[state=…]:animate-*` classes were pulled out of the `cva` base for
  exactly this reason.

- **`AnimatePresence` detects removal on its direct keyed child, but exit
  animations run per motion node at any depth.** Registration happens in each
  element's `ExitAnimationFeature.mount()` via `PresenceContext`, so a plain
  keyed wrapper with animated descendants is fine and is what `Modal` uses. This
  reads like a bug and has been reported as one — it isn't.

- **Direction can't be expressed logically in a transform.** `drawerStart`
  receives `custom={isRtl}`. Resolve that from the animated element itself
  (`useDirection(ref)`), not `document.documentElement`, or it will disagree with
  the `rtl:` CSS fallback inside a locally-flipped subtree.

## Adding motion to another component

1. Replace the root element with `<Animated>`; give it a `preset` and a `mode`.
2. Move the component's existing CSS transition into `fallbackClassName`.
3. For mount/unmount animations, wrap in `<AnimatedPresence>` and give the child
   a stable `key`.
4. If the element is only conditionally animated, gate it with `enabled`.
5. Add a preset to [presets.ts](presets.ts) only if no existing one fits — the
   shared vocabulary is the point.

No new imports and no dependency changes should be needed. If a step requires
importing `motion` outside `MotionProvider.tsx`, the design has been broken.

## Testing

No unit tests yet. [MotionProvider.stories.tsx](MotionProvider.stories.tsx)
covers both paths, reduced motion, the drawer, and a consumer-built component;
its `disabled` control is the quickest way to A/B a change.

Real springs make assertions timing-dependent, so suites should either render
the provider with `disabled` or emulate `prefers-reduced-motion` — the provider
defaults to `reducedMotion="user"`. **Both paths are separate code; a change to
one is not verified by testing the other.**
