import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
  act,
} from '@testing-library/react';
import { AIChat, type AIChatComposerProps } from './AIChat';
import type { AIMessage } from './types';

const messages: AIMessage[] = [
  {
    id: 'm1',
    role: 'user',
    status: 'complete',
    timestamp: new Date('2026-01-01T10:00:00Z'),
    content: [{ type: 'text', text: 'hello' }],
  },
  {
    id: 'm2',
    role: 'assistant',
    status: 'complete',
    timestamp: new Date('2026-01-01T10:00:05Z'),
    content: [{ type: 'text', text: 'hi there' }],
  },
];

async function setupUser() {
  const { default: userEvent } = await import('@testing-library/user-event');
  return userEvent.setup();
}

afterEach(() => {
  vi.useRealTimers();
});

describe('AIChat (ChatComposer integration)', () => {
  it('keeps the "Message" input label and sends trimmed text', async () => {
    const onSendMessage = vi.fn();
    const user = await setupUser();
    render(<AIChat messages={messages} onSendMessage={onSendMessage} />);
    // MessageComposer parity: same accessible name as before the swap.
    const input = screen.getByLabelText('Message');
    await user.type(input, '  what are my labs?  ');
    await user.click(screen.getByLabelText('Send message'));
    expect(onSendMessage).toHaveBeenCalledWith('what are my labs?');
    // The composer clears after a successful send.
    expect(input).toHaveValue('');
  });

  it('sends on Enter and inserts a newline on Shift+Enter', async () => {
    const onSendMessage = vi.fn();
    const user = await setupUser();
    render(<AIChat messages={messages} onSendMessage={onSendMessage} />);
    const input = screen.getByLabelText('Message');
    await user.type(input, 'line one{Shift>}{Enter}{/Shift}line two');
    expect(onSendMessage).not.toHaveBeenCalled();
    await user.type(input, '{Enter}');
    expect(onSendMessage).toHaveBeenCalledWith('line one\nline two');
  });

  it('disables the composer while generating', () => {
    render(<AIChat messages={messages} isGenerating onSendMessage={vi.fn()} />);
    expect(screen.getByLabelText('Message')).toBeDisabled();
  });

  it('restores the draft when onSendMessage throws', async () => {
    const onSendMessage = vi.fn(() => {
      throw new Error('backend down');
    });
    const user = await setupUser();
    render(<AIChat messages={messages} onSendMessage={onSendMessage} />);
    const input = screen.getByLabelText('Message');
    await user.type(input, 'important question');
    await user.click(screen.getByLabelText('Send message'));
    // The composer clears optimistically; AIChat restores the draft on
    // failure (MessageComposer parity).
    await waitFor(() => expect(input).toHaveValue('important question'));
  });

  it('restores the draft when an async onSendMessage rejects and reports onError', async () => {
    const onSendMessage = vi.fn(() =>
      Promise.reject(new Error('backend down'))
    );
    const onError = vi.fn();
    const user = await setupUser();
    render(
      <AIChat
        messages={messages}
        onSendMessage={onSendMessage}
        composerProps={{ onError }}
      />
    );
    const input = screen.getByLabelText('Message');
    await user.type(input, 'important question');
    await user.click(screen.getByLabelText('Send message'));
    await waitFor(() => expect(input).toHaveValue('important question'));
    // Same copy MessageComposer reported through onError.
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        'Failed to send message',
        expect.objectContaining({ reason: 'send-failed' })
      )
    );
  });

  it('does not clobber newer input when a stale send fails', async () => {
    let rejectSend!: (reason: Error) => void;
    const onSendMessage = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSend = reject;
        })
    );
    const user = await setupUser();
    render(<AIChat messages={messages} onSendMessage={onSendMessage} />);
    const input = screen.getByLabelText('Message');
    await user.type(input, 'first message');
    await user.click(screen.getByLabelText('Send message'));
    // While the send is pending, the user starts a newer draft.
    await user.type(input, 'newer draft');
    rejectSend(new Error('backend down'));
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The failed send must not overwrite the newer input.
    expect(input).toHaveValue('newer draft');
  });

  it('restores a host-controlled draft through onValueChange on failure', async () => {
    const onSendMessage = vi.fn(() =>
      Promise.reject(new Error('backend down'))
    );
    function Host() {
      const [value, setValue] = React.useState('');
      return (
        <AIChat
          messages={messages}
          onSendMessage={onSendMessage}
          composerProps={{ value, onValueChange: setValue }}
        />
      );
    }
    const user = await setupUser();
    render(<Host />);
    const input = screen.getByLabelText('Message');
    await user.type(input, 'controlled draft');
    await user.click(screen.getByLabelText('Send message'));
    await waitFor(() => expect(input).toHaveValue('controlled draft'));
  });

  it('renders a RecordButton in the mic slot when talkToText is on', () => {
    const { container } = render(
      <AIChat messages={messages} onSendMessage={vi.fn()} talkToText />
    );
    const micSlot = container.querySelector(
      '[data-slot="chat-composer-mic-slot"]'
    );
    expect(micSlot).not.toBeNull();
    expect(screen.getByLabelText('Start recording')).toBeInTheDocument();
  });

  it('sends the prompt when a suggestion chip is clicked', async () => {
    const onSendMessage = vi.fn();
    const user = await setupUser();
    render(
      <AIChat
        messages={messages}
        onSendMessage={onSendMessage}
        suggestions={[
          { id: 's1', label: 'Schedule', prompt: 'Schedule a follow-up' },
        ]}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(onSendMessage).toHaveBeenCalledWith('Schedule a follow-up');
  });

  describe('legacy MessageComposer composerProps compatibility', () => {
    it('hides attachments by default and maps showAttachmentPicker to allowAttachments', () => {
      const { rerender } = render(
        <AIChat messages={messages} onSendMessage={vi.fn()} />
      );
      expect(screen.queryByLabelText('Add to message')).toBeNull();
      rerender(
        <AIChat
          messages={messages}
          onSendMessage={vi.fn()}
          composerProps={{ showAttachmentPicker: true }}
        />
      );
      expect(screen.getByLabelText('Add to message')).toBeInTheDocument();
    });

    it('renders a legacy inputTrailing node in the mic slot', () => {
      render(
        <AIChat
          messages={messages}
          onSendMessage={vi.fn()}
          composerProps={{
            inputTrailing: <span data-testid="legacy-trailing">mic</span>,
          }}
        />
      );
      expect(screen.getByTestId('legacy-trailing')).toBeInTheDocument();
    });

    it('lets composerProps micSlot win over inputTrailing and talkToText', () => {
      render(
        <AIChat
          messages={messages}
          onSendMessage={vi.fn()}
          talkToText
          composerProps={{
            inputTrailing: <span data-testid="legacy-trailing">a</span>,
            micSlot: <span data-testid="new-mic-slot">b</span>,
          }}
        />
      );
      expect(screen.getByTestId('new-mic-slot')).toBeInTheDocument();
      expect(screen.queryByTestId('legacy-trailing')).toBeNull();
      expect(screen.queryByLabelText('Start recording')).toBeNull();
    });

    it('accepts legacy variant and showCameraButton without effect', () => {
      const legacy: AIChatComposerProps = {
        variant: 'minimal',
        showCameraButton: true,
      };
      render(
        <AIChat
          messages={messages}
          onSendMessage={vi.fn()}
          composerProps={legacy}
        />
      );
      expect(screen.getByLabelText('Message')).toBeInTheDocument();
    });

    it('emulates onTypingStart / onTypingStop (idle + send)', async () => {
      const onTypingStart = vi.fn();
      const onTypingStop = vi.fn();
      render(
        <AIChat
          messages={messages}
          onSendMessage={vi.fn()}
          composerProps={{ onTypingStart, onTypingStop }}
        />
      );
      const input = screen.getByLabelText('Message');
      fireEvent.change(input, { target: { value: 'typing…' } });
      expect(onTypingStart).toHaveBeenCalledTimes(1);
      expect(onTypingStop).not.toHaveBeenCalled();
      // Sending stops typing immediately (MessageComposer parity).
      fireEvent.click(screen.getByLabelText('Send message'));
      expect(onTypingStop).toHaveBeenCalled();
    });

    it('stops typing after 2s idle', () => {
      vi.useFakeTimers();
      const onTypingStart = vi.fn();
      const onTypingStop = vi.fn();
      render(
        <AIChat
          messages={messages}
          onSendMessage={vi.fn()}
          composerProps={{ onTypingStart, onTypingStop }}
        />
      );
      const input = screen.getByLabelText('Message');
      fireEvent.change(input, { target: { value: 'typing…' } });
      expect(onTypingStart).toHaveBeenCalledTimes(1);
      act(() => {
        vi.advanceTimersByTime(2100);
      });
      expect(onTypingStop).toHaveBeenCalledTimes(1);
      // MessageComposer parity: while the draft stays non-empty the cycle
      // restarts — a keepalive loop hosts' typing indicators rely on.
      expect(onTypingStart).toHaveBeenCalledTimes(2);
      cleanup();
    });

    it('lets composerProps override the built-in defaults (placeholder, disabled)', () => {
      render(
        <AIChat
          messages={messages}
          isGenerating
          onSendMessage={vi.fn()}
          composerProps={{
            placeholder: 'Custom placeholder',
            disabled: false,
            isSending: false,
          }}
        />
      );
      const input = screen.getByPlaceholderText('Custom placeholder');
      // OzwellChatView relies on re-enabling the composer while generating.
      expect(input).not.toBeDisabled();
    });

    it('lets composerProps override onSend entirely', async () => {
      const onSendMessage = vi.fn();
      const onSend = vi.fn();
      const user = await setupUser();
      render(
        <AIChat
          messages={messages}
          onSendMessage={onSendMessage}
          composerProps={{ onSend }}
        />
      );
      const input = screen.getByLabelText('Message');
      await user.type(input, 'custom send');
      await user.click(screen.getByLabelText('Send message'));
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'custom send' })
      );
      expect(onSendMessage).not.toHaveBeenCalled();
    });

    it('stops typing on send even when composerProps overrides onSend', async () => {
      const onTypingStart = vi.fn();
      const onTypingStop = vi.fn();
      const onSend = vi.fn();
      render(
        <AIChat
          messages={messages}
          onSendMessage={vi.fn()}
          composerProps={{ onSend, onTypingStart, onTypingStop }}
        />
      );
      const input = screen.getByLabelText('Message');
      fireEvent.change(input, { target: { value: 'host send' } });
      expect(onTypingStart).toHaveBeenCalledTimes(1);
      // MessageComposer parity: its submit path stopped typing even when
      // the host overrode onSend.
      fireEvent.click(screen.getByLabelText('Send message'));
      expect(onTypingStop).toHaveBeenCalledTimes(1);
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'host send' })
      );
    });
  });
});
