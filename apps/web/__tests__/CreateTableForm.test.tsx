import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import CreateTablePage from '@/app/admin/tables/create/page';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  adminApi: {
    createTable: vi.fn(),
  },
}));

describe('CreateTableForm', () => {
  const mockPush = vi.fn();
  const mockRouter = {
    push: mockPush,
    back: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue(mockRouter as any);
  });

  it('should validate big blind >= small blind', async () => {
    render(<CreateTablePage />);

    const smallBlindInput = screen.getByLabelText(/small blind/i);
    const bigBlindInput = screen.getByLabelText(/big blind/i);
    const submitButton = screen.getByRole('button', { name: /create table/i });

    fireEvent.change(smallBlindInput, { target: { value: '20' } });
    fireEvent.change(bigBlindInput, { target: { value: '10' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/big blind must be >= small blind/i)).toBeInTheDocument();
    });
  });

  it('should validate initial stack > big blind', async () => {
    render(<CreateTablePage />);

    const bigBlindInput = screen.getByLabelText(/big blind/i);
    const initialStackInput = screen.getByLabelText(/initial stack/i);
    const submitButton = screen.getByRole('button', { name: /create table/i });

    fireEvent.change(bigBlindInput, { target: { value: '20' } });
    fireEvent.change(initialStackInput, { target: { value: '10' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/initial stack must be > big blind/i)).toBeInTheDocument();
    });
  });

  it('should validate action timeout >= 1000ms', async () => {
    render(<CreateTablePage />);

    const timeoutInput = screen.getByLabelText(/action timeout/i);
    const submitButton = screen.getByRole('button', { name: /create table/i });

    fireEvent.change(timeoutInput, { target: { value: '500' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/action timeout must be >= 1000ms/i)).toBeInTheDocument();
    });
  });
});
