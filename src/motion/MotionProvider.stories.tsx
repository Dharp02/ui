import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MotionProvider } from './MotionProvider';
import { Animated, AnimatedPresence } from './Animated';
import { Button } from '../components/Button';
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalClose,
  ModalBody,
  ModalFooter,
} from '../components/Modal';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarNav,
  SidebarNavItem,
  SidebarProvider,
  useSidebar,
} from '../components/Sidebar';

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof MotionProvider> = {
  id: 'foundations-motion',
  title: 'Foundations/Motion',
  component: MotionProvider,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `### What it's for

Opting an application into real animations. Components in the library ship with CSS transitions and look finished without any of this; wrapping the app in \`<MotionProvider>\` from \`@mieweb/ui/motion\` upgrades the ones that support it — currently \`Modal\` and \`Sidebar\` — to spring-driven transforms and, crucially, **exit** animations that CSS cannot express for an unmounting element.

The opt-in is resolved in the module graph, not by a prop. \`motion\` is an optional peer dependency imported only by the \`@mieweb/ui/motion\` entry, so an app that never imports that entry never pays for it and its bundle is unchanged.

### Use it when

- The product wants motion as a deliberate, consistent layer rather than per-component one-offs.
- You need an element to animate *out*. A component that returns \`null\` on close has no element left for CSS to transition.
- You want motion policy — duration, easing, reduced-motion handling — configured once at the root.

### Don't use it when

- A single component needs a bespoke transition. Pass it a \`className\` with a CSS transition instead; that costs nothing.
- The animation is a looping or decorative effect (spinners, skeletons). Those stay in CSS.
- Bundle size is the binding constraint and the CSS transitions already look right — that is the supported default, not a degraded mode.

### Example

\`\`\`tsx
// App root — the entire opt-in.
import { MotionProvider } from '@mieweb/ui/motion';

createRoot(el).render(
  <MotionProvider>
    <App />
  </MotionProvider>
);
\`\`\`

Existing \`<Modal>\` and \`<Sidebar>\` call sites need no changes. To animate a component of your own on the same presets:

\`\`\`tsx
import { Animated, AnimatedPresence } from '@mieweb/ui';

<AnimatedPresence>
  {open && (
    <Animated key="panel" preset="modalContent" mode="presence" className="...">
      {children}
    </Animated>
  )}
</AnimatedPresence>
\`\`\`

\`Animated\` renders a plain element when no provider is present, so a component written this way works in both apps.

### Limitations

- Only \`Modal\` and \`Sidebar\` are wired up so far. Every other component ignores the provider and keeps its CSS transitions.
- \`reducedMotion\` defaults to \`'user'\`, which drops transforms and keeps opacity when the OS asks for reduced motion. Verify both paths — they are different code.
- Motion holds an element at rest with a \`transform\`, and a transformed ancestor becomes the containing block for \`position: fixed\` descendants. Components that are only sometimes animated should pass \`enabled={false}\` the rest of the time, as \`Sidebar\` does on desktop.
- \`disabled\` forces every component back onto the CSS path. It exists for test runs, where springs make assertions timing-dependent.`,
      },
    },
  },
  tags: ['autodocs', 'scope:general-purpose', 'maturity:experimental'],
  argTypes: {
    disabled: {
      control: 'boolean',
      description:
        'Render children with no runtime, forcing every component onto its CSS path.',
      table: { category: 'Behaviour' },
    },
    reducedMotion: {
      control: 'select',
      options: ['user', 'always', 'never'],
      description: 'How to honor the OS "reduce motion" setting.',
      table: { category: 'Accessibility' },
    },
  },
  args: {
    disabled: false,
    reducedMotion: 'user',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// =============================================================================
// Demos
// =============================================================================

function Stage({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 p-8">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-muted-foreground max-w-prose text-sm">{hint}</p>
      </div>
      {children}
    </div>
  );
}

/**
 * The clearest demonstration of what motion buys: toggle `disabled` in the
 * controls and close the dialog. Without a runtime it vanishes on the frame it
 * closes, because `Modal` unmounts and CSS has nothing left to animate.
 */
function ModalDemo() {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      <Modal open={open} onOpenChange={setOpen} size="md">
        <ModalHeader>
          <ModalTitle>Discard draft?</ModalTitle>
          <ModalClose />
        </ModalHeader>
        <ModalBody>
          <p className="text-sm">
            Watch the close, not the open. The exit animation is the part CSS
            cannot do here.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => setOpen(false)}>Discard</Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

function DrawerTrigger() {
  const { isMobileOpen, toggleMobile } = useSidebar();
  return (
    <Button onClick={toggleMobile}>
      {isMobileOpen ? 'Close drawer' : 'Open drawer'}
    </Button>
  );
}

/**
 * `mobileBreakpoint` is forced so the drawer behaviour is reachable at any
 * Storybook canvas width — in a real app this is the sub-1024px layout.
 */
function DrawerDemo() {
  return (
    <SidebarProvider mobileBreakpoint="(min-width: 0px)">
      <DrawerTrigger />
      <Sidebar>
        <SidebarHeader>
          <span className="text-base font-bold">Navigation</span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarNav>
            <SidebarNavItem label="Dashboard" href="#" isActive />
            <SidebarNavItem label="Orders" href="#" />
            <SidebarNavItem label="Reports" href="#" />
            <SidebarNavItem label="Settings" href="#" />
          </SidebarNav>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}

/** How a consuming app animates a component the library does not cover. */
function CustomComponentDemo() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="space-y-4">
      <Button onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide panel' : 'Show panel'}
      </Button>
      <AnimatedPresence>
        {open && (
          <Animated
            key="custom-panel"
            preset="modalContent"
            mode="presence"
            className="border-border bg-card max-w-md rounded-xl border p-6 shadow-lg"
          >
            <p className="text-sm">
              This panel is not a library component. It uses the same presets
              through <code>Animated</code>, and renders as a plain{' '}
              <code>div</code> in apps that have not opted in.
            </p>
          </Animated>
        )}
      </AnimatedPresence>
    </div>
  );
}

// =============================================================================
// Stories
// =============================================================================

export const Default: Story = {
  render: (args) => (
    <MotionProvider {...args}>
      <Stage
        title="Modal, with motion"
        hint="Open and close the dialog. Then flip `disabled` in the controls and close it again — the difference is entirely in the exit."
      >
        <ModalDemo />
      </Stage>
    </MotionProvider>
  ),
};

export const WithoutMotion: Story = {
  args: { disabled: true },
  render: (args) => (
    <MotionProvider {...args}>
      <Stage
        title="Modal, CSS path"
        hint="The behaviour every app gets today without importing @mieweb/ui/motion. The dialog fades in, then disappears instantly on close because the element unmounts."
      >
        <ModalDemo />
      </Stage>
    </MotionProvider>
  ),
};

export const Drawer: Story = {
  render: (args) => (
    <MotionProvider {...args}>
      <Stage
        title="Sidebar drawer"
        hint="The off-canvas drawer springs in along the inline axis and its backdrop fades. On the CSS path the same slide runs as a 300ms transform transition."
      >
        <DrawerDemo />
      </Stage>
    </MotionProvider>
  ),
};

export const ReducedMotion: Story = {
  args: { reducedMotion: 'always' },
  render: (args) => (
    <MotionProvider {...args}>
      <Stage
        title="Reduced motion"
        hint="What a user with `prefers-reduced-motion` sees. Transforms are dropped and only opacity animates — the dialog still enters and exits, it just does not travel."
      >
        <ModalDemo />
      </Stage>
    </MotionProvider>
  ),
};

export const CustomComponent: Story = {
  render: (args) => (
    <MotionProvider {...args}>
      <Stage
        title="Animating your own component"
        hint="Apps compose `Animated` and `AnimatedPresence` against the library's presets, so product code animates consistently with the design system and still degrades to a plain element."
      >
        <CustomComponentDemo />
      </Stage>
    </MotionProvider>
  ),
};
