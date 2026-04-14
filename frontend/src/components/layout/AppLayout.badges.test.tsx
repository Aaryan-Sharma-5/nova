import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AppLayout } from '@/components/layout/AppLayout';

const mockProtectedGetApi = vi.fn();

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    protectedGetApi: (...args: unknown[]) => mockProtectedGetApi(...args),
    protectedPostApi: vi.fn(),
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      full_name: 'HR Administrator',
      email: 'hr.admin@company.com',
      role: 'hr',
    },
    token: 'fake-token',
    logout: vi.fn(),
  }),
}));

vi.mock('@/contexts/EmployeeContext', () => ({
  useEmployees: () => ({
    refreshData: vi.fn(),
    employees: [
      { id: 'NOVA-ENG001', name: 'Arjun Sharma' },
    ],
  }),
}));

describe('AppLayout sidebar badges', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockProtectedGetApi.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls pending-review endpoint and updates badges', async () => {
    mockProtectedGetApi
      .mockResolvedValueOnce({
        count: 4,
        sessions: [
          { status: 'scheduled', scheduled_date: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString() },
          { status: 'in_progress', scheduled_date: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString() },
          { status: 'completed', scheduled_date: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString() },
          { status: 'scheduled', scheduled_date: new Date(Date.now() + 12 * 24 * 3600 * 1000).toISOString() },
        ],
      })
      .mockResolvedValueOnce({ count: 0, sessions: [] });

    render(
      <MemoryRouter>
        <AppLayout>
          <div>content</div>
        </AppLayout>
      </MemoryRouter>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const reviewLink = screen.getByRole('link', { name: /Sessions (to )?Review/i });
    const scheduleLink = screen.getByRole('link', { name: /Schedule Sessions/i });

    expect(within(reviewLink).getByText('4')).toBeInTheDocument();
    expect(within(scheduleLink).getByText('2')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(60000);
      await Promise.resolve();
    });

    expect(within(reviewLink).queryByText('4')).not.toBeInTheDocument();
    expect(within(scheduleLink).queryByText('2')).not.toBeInTheDocument();

    const pendingReviewCalls = mockProtectedGetApi.mock.calls.filter(
      (args) => args[0] === '/api/feedback/sessions/pending-review',
    );
    expect(pendingReviewCalls).toHaveLength(2);
  });
});
