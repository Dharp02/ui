import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithTheme } from '../../test/test-utils';
import { Assessment, type AssessmentProps } from './Assessment';

const concerns: AssessmentProps['concerns'] = [
  {
    concernId: 'concern-1',
    clinicalStatus: 'active',
    assertions: [
      {
        id: 'assertion-1',
        date: '2026-09-16',
        text: 'Essential hypertension',
        verificationStatus: 'confirmed',
      },
    ],
  },
];

const items: AssessmentProps['items'] = [
  { concernId: 'concern-1', assertionId: 'assertion-1' },
];

const orders: AssessmentProps['orders'] = [
  {
    orderId: 'order-1',
    type: 'medication',
    display: 'Lisinopril 10 mg',
    concernId: 'concern-1',
  },
];

function renderAssessment(props: Partial<AssessmentProps> = {}) {
  return renderWithTheme(
    <Assessment
      concerns={concerns}
      items={items}
      renderOrderSearch={false}
      {...props}
    />
  );
}

describe('Assessment actions', () => {
  it('does not render actions the host cannot handle', () => {
    renderAssessment();

    expect(
      screen.queryByLabelText(/actions for essential hypertension/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /refine/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /add order/i })
    ).not.toBeInTheDocument();
  });

  it('dispatches refine and revise through onAction', () => {
    const onAction = vi.fn();
    renderAssessment({ onAction });

    fireEvent.click(screen.getByRole('button', { name: /refine/i }));
    fireEvent.click(screen.getByRole('button', { name: /revise/i }));

    expect(onAction).toHaveBeenNthCalledWith(1, items[0], 'refine');
    expect(onAction).toHaveBeenNthCalledWith(2, items[0], 'revise');
    expect(
      screen.getByRole('button', { name: /add order/i })
    ).toBeInTheDocument();
  });

  it('delegates add order without advertising an inline form', () => {
    const onAction = vi.fn();
    renderAssessment({ onAction });

    const addOrderButton = screen.getByRole('button', { name: /add order/i });
    expect(addOrderButton).not.toHaveAttribute('aria-expanded');
    expect(addOrderButton).not.toHaveAttribute('aria-controls');

    fireEvent.click(addOrderButton);

    expect(onAction).toHaveBeenCalledWith(items[0], 'add-order');
    expect(
      screen.queryByRole('form', { name: /add order for/i })
    ).not.toBeInTheDocument();
  });

  it('removes a concern through its row action and announces it', async () => {
    const onRemoveAssessment = vi.fn();
    renderAssessment({ onRemoveAssessment });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove Essential hypertension from assessment',
      })
    );

    expect(onRemoveAssessment).toHaveBeenCalledWith(items[0]);
    expect(
      await screen.findByText('Essential hypertension removed from assessment')
    ).toBeInTheDocument();
  });

  it('gives a nested order toolbar precedence over concern actions', () => {
    renderAssessment({
      orders,
      onAction: vi.fn(),
      onEditOrder: vi.fn(),
    });

    const concernActions = screen.getByRole('toolbar', {
      name: 'Actions for Essential hypertension',
    });
    expect(
      screen.getByRole('toolbar', { name: 'Actions for Lisinopril 10 mg' })
    ).toBeInTheDocument();
    expect(concernActions).toHaveClass(
      'pointer-fine:group-has-[[data-order-id]:hover]:pointer-events-none',
      'pointer-fine:group-has-[[data-order-id]:hover]:opacity-0',
      'pointer-fine:group-has-[[data-order-id]:focus-within]:pointer-events-none',
      'pointer-fine:group-has-[[data-order-id]:focus-within]:opacity-0'
    );
  });

  it('opens quick order entry and submits a linked order', async () => {
    const onAddOrder = vi.fn();
    renderAssessment({ onAddOrder });

    expect(
      screen.queryByRole('button', { name: /refine/i })
    ).not.toBeInTheDocument();
    const addOrderButton = screen.getByRole('button', { name: /add order/i });
    expect(addOrderButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(addOrderButton);
    const orderInput = screen.getByRole('textbox', {
      name: 'Order description',
    });
    const orderForm = screen.getByRole('form', {
      name: /add order for essential hypertension/i,
    });
    expect(addOrderButton).toHaveAttribute('aria-expanded', 'true');
    expect(addOrderButton).toHaveAttribute('aria-controls', orderForm.id);
    expect(orderInput).toHaveFocus();

    fireEvent.change(orderInput, {
      target: { value: 'lisinopril 10 mg tablet' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAddOrder).toHaveBeenCalledWith(items[0], {
      type: 'medication',
      display: 'lisinopril 10 mg tablet',
    });
    expect(
      screen.queryByRole('form', { name: /add order for/i })
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText(
        /lisinopril 10 mg tablet added to essential hypertension/i
      )
    ).toBeInTheDocument();
  });

  it('does not render mutation actions when read only', () => {
    renderAssessment({
      readOnly: true,
      onAction: vi.fn(),
      onAddOrder: vi.fn(),
    });

    expect(
      screen.queryByLabelText(/actions for essential hypertension/i)
    ).not.toBeInTheDocument();
  });
});
