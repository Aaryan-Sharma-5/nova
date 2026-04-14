import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WhatIfSimulator from '@/components/dashboard/WhatIfSimulator';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: null }),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    protectedPostApi: vi.fn(),
  };
});

describe('WhatIfSimulator modal behavior', () => {
  it('renders with constrained height and scrollable body, and closes on backdrop click', () => {
    const onOpenChange = vi.fn();
    const { container } = render(
      <WhatIfSimulator
        open
        onOpenChange={onOpenChange}
        employeeId="NOVA-ENG001"
      />,
    );

    expect(screen.getByText('What-If Intervention Simulator')).toBeInTheDocument();

    const modalShell = container.querySelector('.max-h-\\[90vh\\]');
    const scrollBody = container.querySelector('.overflow-y-auto');
    expect(modalShell).toBeTruthy();
    expect(scrollBody).toBeTruthy();

    const backdrop = container.querySelector('.fixed.inset-0.z-50');
    expect(backdrop).toBeTruthy();
    if (backdrop) {
      fireEvent.click(backdrop);
    }

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
