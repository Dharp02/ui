import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import {
  Toast,
  ToastContainer,
  ToastProvider,
  useToast,
  type ToastPosition,
} from './index';
import { Button } from '../Button';
// Story-only import. Stories are not tsup entries, so this never reaches dist
// and `motion` stays an optional peer dependency for consumers.
import { MotionProvider } from '../../motion/MotionProvider';

// =============================================================================
// Demo Components
// =============================================================================

function ToastDemo() {
  const { success, error, warning, info, toasts, dismiss } = useToast();

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-wrap justify-center gap-2">
        <button
          onClick={() => success('Changes saved successfully!')}
          className="rounded-lg bg-green-700 px-4 py-2 text-white transition-colors hover:bg-green-800"
        >
          Success
        </button>
        <button
          onClick={() => error('Something went wrong. Please try again.')}
          className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
        >
          Error
        </button>
        <button
          onClick={() => warning('Your session will expire in 5 minutes.')}
          className="rounded-lg bg-amber-700 px-4 py-2 text-white transition-colors hover:bg-amber-800"
        >
          Warning
        </button>
        <button
          onClick={() => info('New features are available!')}
          className="bg-primary-800 hover:bg-primary-900 rounded-lg px-4 py-2 text-white transition-colors"
        >
          Info
        </button>
      </div>

      <ToastContainer
        toasts={toasts}
        onDismiss={dismiss}
        position="bottom-right"
      />
    </div>
  );
}

function ToastWithTitleDemo() {
  const { toast, toasts, dismiss } = useToast();

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={() =>
          toast({
            title: 'Update Available',
            message: 'A new version of the app is ready to install.',
            variant: 'info',
            action: {
              label: 'Update Now',
              onClick: () => console.log('Update clicked'),
            },
          })
        }
        className="bg-primary-800 hover:bg-primary-900 rounded-lg px-4 py-2 text-white transition-colors"
      >
        Show Toast with Title & Action
      </button>

      <ToastContainer
        toasts={toasts}
        onDismiss={dismiss}
        position="bottom-right"
      />
    </div>
  );
}

function ToastPositionsDemo() {
  const [position, setPosition] = useState<ToastPosition>('bottom-right');
  const { success, toasts, dismiss, dismissAll } = useToast();

  const positions: ToastPosition[] = [
    'top-left',
    'top-center',
    'top-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
  ];

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-wrap justify-center gap-2">
        {positions.map((pos) => (
          <button
            key={pos}
            onClick={() => {
              setPosition(pos);
              dismissAll();
              setTimeout(() => success(`Toast at ${pos}`), 100);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              position === pos
                ? 'bg-primary-800 text-white'
                : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismiss} position={position} />
    </div>
  );
}

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof Toast> = {
  id: 'feedback-toast',
  title: 'Components/Feedback/Toast',
  component: Toast,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `### What it's for

Transient notifications. Wrap the app once in \`ToastProvider\` (\`position\`, \`maxToasts\`, \`defaultDuration\`), then call \`useToast()\` anywhere: \`toast({ title, message, variant, action })\` or the shorthands \`success\` / \`error\` / \`warning\` / \`info\`. \`ToastContainer\` is portalled to the body and stacks toasts in the chosen corner; each toast auto-dismisses after \`duration\` ms (0 keeps it).

### Use it when

- Confirming that an action completed ("Saved", "Invite sent") or failed in a recoverable way.
- Offering a quick follow-up (\`action: { label: 'Undo', onClick }\`).
- Something happened elsewhere (background sync, remote edit) that the user should notice but not deal with now.

### Don't use it when

- The message must stay visible or be re-read — \`Alert\` inline, or \`NotificationCenter\` for a history.
- The user must respond before continuing — \`AlertDialog\`.
- The information is essential to the task (validation errors): screen-reader users may miss a toast; put it in the form.

### Example

\`\`\`tsx
// App root
<ToastProvider position="bottom-right" maxToasts={3}>
  <App />
</ToastProvider>

// Anywhere below
const { success, error } = useToast();
try {
  await save();
  success('Changes saved', { action: { label: 'Undo', onClick: undo } });
} catch (e) {
  error('Could not save', { duration: 0 });
}
\`\`\`

### Limitations

- **Accessibility:** the container is \`aria-live="polite"\` / \`aria-atomic\` and each toast has \`role="alert"\`, so new toasts are announced without extra work. Auto-dismiss still means the text can vanish before a screen-reader user reaches the action — keep critical actions available elsewhere.
- Toasts are \`fixed\` at \`z-50\`; they render above \`Modal\` in DOM order but are not focus-managed.
- The dismiss button's \`aria-label\` ("Dismiss notification") is English; translate it in the host.
- One provider per app: nested providers create separate stacks.

### Motion

Entering is CSS by default. An app that opts into [\`@mieweb/ui/motion\`](?path=/docs/foundations-motion--docs) gets a spring enter and a real **exit** animation — which the CSS path cannot do, because a dismissed toast unmounts and leaves nothing to transition. Motion also enters from whichever edge the stack is actually pinned to, where the CSS fallback always slides from the inline end. See the **Motion** story below; nothing changes at the call site either way.

One thing the demo can't show: the stack does not yet reflow when a toast is removed from the middle — the ones below it jump up. That needs layout animations, which the provider's \`domAnimation\` feature set deliberately excludes.`,
      },
    },
    catalog: {
      entry: '@mieweb/ui',
      relationships: [
        {
          type: 'alternative to',
          target: 'feedback-alert',
          why: 'Alert is inline and persistent; Toast is transient, stacked and announced.',
        },
        {
          type: 'alternative to',
          target: 'feedback-notificationcenter',
          why: 'NotificationCenter keeps a readable history with read state; Toast disappears.',
        },
        {
          type: 'composes with',
          target: 'foundations-motion',
          why: 'MotionProvider gives Toast a spring enter, a real exit animation the CSS path cannot do, and an entry direction that follows the stack position.',
        },
      ],
    },
  },
  tags: ['autodocs', 'scope:general-purpose', 'maturity:stable'],
  decorators: [
    (Story) => (
      <ToastProvider>
        <div className="flex min-h-[300px] items-center justify-center p-8">
          <Story />
        </div>
      </ToastProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

// =============================================================================
// Stories
// =============================================================================

export const Default: Story = {
  render: () => <ToastDemo />,
};

export const WithTitleAndAction: Story = {
  render: () => <ToastWithTitleDemo />,
  parameters: {
    docs: {
      description: {
        story: 'Toasts can include a title and an action button.',
      },
    },
  },
};

export const Positions: Story = {
  render: () => <ToastPositionsDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Toasts can be positioned in 6 different locations on the screen.',
      },
    },
  },
};

export const Success: Story = {
  args: {
    id: 'success-toast',
    message: 'Your changes have been saved successfully.',
    variant: 'success',
    onClose: () => {},
  },
};

export const Error: Story = {
  args: {
    id: 'error-toast',
    title: 'Error',
    message: 'Failed to save changes. Please try again.',
    variant: 'error',
    onClose: () => {},
  },
};

export const Warning: Story = {
  args: {
    id: 'warning-toast',
    message: 'Your session will expire in 5 minutes.',
    variant: 'warning',
    onClose: () => {},
  },
};

export const Info: Story = {
  args: {
    id: 'info-toast',
    title: 'New Features',
    message: 'Check out the latest updates in your dashboard.',
    variant: 'info',
    onClose: () => {},
  },
};

export const WithAction: Story = {
  args: {
    id: 'action-toast',
    message: 'Item moved to trash.',
    variant: 'info',
    action: {
      label: 'Undo',
      onClick: () => console.log('Undo clicked'),
    },
    onClose: () => {},
  },
};

export const NonDismissible: Story = {
  args: {
    id: 'persistent-toast',
    title: 'System Update',
    message: 'An important update is being installed...',
    variant: 'warning',
    dismissible: false,
    onClose: () => {},
  },
};

// ============================================================================
// Motion
// ============================================================================

/**
 * A/B harness for the motion opt-in.
 *
 * The toasts are raised without auto-dismiss so the exit is a deliberate click
 * rather than something the reader has to catch. Position is switchable because
 * the entry direction is derived from it — the point the CSS fallback misses.
 *
 * Flipping the switch remounts the `Animated` elements (they swap between
 * motion components and plain tags), so compare by repeating the gesture with
 * the switch set each way rather than flipping it mid-animation.
 */
function MotionDemo() {
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [position, setPosition] = useState<ToastPosition>('bottom-end');
  const { toast, toasts, dismiss } = useToast();

  return (
    <MotionProvider disabled={!motionEnabled}>
      <div className="flex flex-col items-center gap-4">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            onClick={() =>
              toast({
                message: 'Dismiss me — the exit is the interesting part.',
                variant: 'info',
                duration: 0,
              })
            }
          >
            Add Toast
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMotionEnabled((enabled) => !enabled)}
            aria-pressed={motionEnabled}
          >
            Motion: {motionEnabled ? 'on' : 'off'}
          </Button>
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            Position
            <select
              value={position}
              onChange={(event) =>
                setPosition(event.target.value as ToastPosition)
              }
              className="border-border bg-background rounded-md border px-2 py-1 text-xs"
            >
              <option value="bottom-end">bottom-end</option>
              <option value="bottom-start">bottom-start</option>
              <option value="top-end">top-end</option>
              <option value="top-start">top-start</option>
              <option value="top-center">top-center</option>
              <option value="bottom-center">bottom-center</option>
            </select>
          </label>
        </div>
        <p className="text-muted-foreground max-w-md text-center text-xs">
          Raise a few toasts, then dismiss them with the switch set each way.
          Change the position to see the entry direction follow the stack.
        </p>

        <ToastContainer
          toasts={toasts}
          onDismiss={dismiss}
          position={position}
        />
      </div>
    </MotionProvider>
  );
}

export const Motion: Story = {
  render: () => <MotionDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Toast under `@mieweb/ui/motion`. With motion on, a toast springs in from the edge its stack is pinned to and animates out on dismiss; with it off it slides in on a CSS keyframe — always from the inline end, whatever the position — and then disappears on the frame it is dismissed, because the component unmounts and CSS has nothing left to transition. Auto-dismiss is disabled here so the exit can be watched deliberately. The provider is normally mounted once at the app root — it is local here so the comparison can be toggled. Call sites are unchanged either way.',
      },
    },
  },
};
