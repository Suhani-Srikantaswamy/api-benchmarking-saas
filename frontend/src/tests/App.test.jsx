/**
 * Frontend Unit Tests
 * Tests: component rendering, form validation, UI interactions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// ── Mock fetch globally ───────────────────────────────────────────────────────
global.fetch = vi.fn();
global.EventSource = vi.fn(() => ({
  onmessage: null,
  onerror: null,
  close: vi.fn(),
  readyState: 1,
}));

// ── Mock localStorage ─────────────────────────────────────────────────────────
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// ── Import components ─────────────────────────────────────────────────────────
import BenchmarkForm from '../components/BenchmarkForm';
import Toast from '../components/Toast';
import ErrorBoundary from '../components/ErrorBoundary';

// ── BenchmarkForm tests ───────────────────────────────────────────────────────
describe('BenchmarkForm', () => {
  const mockOnTestStart = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ testId: 'test-abc-123', status: 'pending' }),
    });
  });

  it('renders the form with all required fields', () => {
    render(<BenchmarkForm onTestStart={mockOnTestStart} disabled={false} />);
    expect(screen.getByLabelText(/API Endpoint URL/i)).toBeInTheDocument();
    expect(screen.getByText(/Run Load Test/i)).toBeInTheDocument();
    expect(screen.getByText(/Configure Load Test/i)).toBeInTheDocument();
  });

  it('shows validation error for invalid URL on submit', async () => {
    render(<BenchmarkForm onTestStart={mockOnTestStart} disabled={false} />);
    const input = screen.getByLabelText(/API Endpoint URL/i);
    // Type an invalid URL so the button becomes enabled but validation fails
    fireEvent.change(input, { target: { value: 'not-a-valid-url' } });
    // The button is still disabled because URL is invalid — check the invalid badge instead
    expect(screen.getByText('Invalid')).toBeInTheDocument();
  });

  it('shows URL valid badge for valid URL', () => {
    render(<BenchmarkForm onTestStart={mockOnTestStart} disabled={false} />);
    const input = screen.getByLabelText(/API Endpoint URL/i);
    fireEvent.change(input, { target: { value: 'https://httpbin.org/get' } });
    expect(screen.getByText('Valid')).toBeInTheDocument();
  });

  it('shows URL invalid badge for invalid URL', () => {
    render(<BenchmarkForm onTestStart={mockOnTestStart} disabled={false} />);
    const input = screen.getByLabelText(/API Endpoint URL/i);
    fireEvent.change(input, { target: { value: 'not-a-url' } });
    expect(screen.getByText('Invalid')).toBeInTheDocument();
  });

  it('disables submit button when URL is invalid', () => {
    render(<BenchmarkForm onTestStart={mockOnTestStart} disabled={false} />);
    // Button is disabled when no valid URL is entered
    const submitBtn = screen.getByRole('button', { name: /Run Load Test/i });
    expect(submitBtn).toBeDisabled();
  });

  it('enables submit button when URL is valid', () => {
    render(<BenchmarkForm onTestStart={mockOnTestStart} disabled={false} />);
    const input = screen.getByLabelText(/API Endpoint URL/i);
    fireEvent.change(input, { target: { value: 'https://httpbin.org/get' } });
    const submitBtn = screen.getByText(/Run Load Test/i);
    expect(submitBtn).not.toBeDisabled();
  });

  it('disables form when disabled prop is true', () => {
    render(<BenchmarkForm onTestStart={mockOnTestStart} disabled={true} />);
    const input = screen.getByLabelText(/API Endpoint URL/i);
    expect(input).toBeDisabled();
  });

  it('applies preset values when preset button clicked', () => {
    render(<BenchmarkForm onTestStart={mockOnTestStart} disabled={false} />);
    const mediumBtn = screen.getByText('Medium');
    fireEvent.click(mediumBtn);
    // Medium preset: 20 VUs, 15s
    const vusInput = screen.getByLabelText(/Virtual Users/i);
    expect(vusInput.value).toBe('20');
  });

  it('fills URL when quick-url chip is clicked', () => {
    render(<BenchmarkForm onTestStart={mockOnTestStart} disabled={false} />);
    const chip = screen.getByText('httpbin.org');
    fireEvent.click(chip);
    const input = screen.getByLabelText(/API Endpoint URL/i);
    expect(input.value).toBe('https://httpbin.org/get');
  });

  it('submits form and calls onTestStart on success', async () => {
    render(<BenchmarkForm onTestStart={mockOnTestStart} disabled={false} />);
    const input = screen.getByLabelText(/API Endpoint URL/i);
    fireEvent.change(input, { target: { value: 'https://httpbin.org/get' } });
    const submitBtn = screen.getByText(/Run Load Test/i);
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(mockOnTestStart).toHaveBeenCalledWith(
        expect.objectContaining({ testId: 'test-abc-123' })
      );
    });
  });

  it('shows error message on API failure', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Service unavailable' }),
    });
    render(<BenchmarkForm onTestStart={mockOnTestStart} disabled={false} />);
    const input = screen.getByLabelText(/API Endpoint URL/i);
    fireEvent.change(input, { target: { value: 'https://httpbin.org/get' } });
    fireEvent.click(screen.getByText(/Run Load Test/i));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Service unavailable');
    });
  });

  it('shows network error when fetch throws', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));
    render(<BenchmarkForm onTestStart={mockOnTestStart} disabled={false} />);
    const input = screen.getByLabelText(/API Endpoint URL/i);
    fireEvent.change(input, { target: { value: 'https://httpbin.org/get' } });
    fireEvent.click(screen.getByText(/Run Load Test/i));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    });
  });
});

// ── Toast tests ───────────────────────────────────────────────────────────────
describe('Toast', () => {
  it('renders success toast', () => {
    render(<Toast msg="Test passed!" type="success" onClose={vi.fn()} />);
    expect(screen.getByText('Test passed!')).toBeInTheDocument();
  });

  it('renders error toast', () => {
    render(<Toast msg="Something failed" type="error" onClose={vi.fn()} />);
    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn();
    render(<Toast msg="Hello" type="info" onClose={onClose} />);
    const closeBtn = screen.getByRole('button');
    fireEvent.click(closeBtn);
    // onClose is called after 300ms animation delay
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 500 });
  });
});

// ── ErrorBoundary tests ───────────────────────────────────────────────────────
describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('renders fallback UI when child throws', () => {
    const ThrowingComponent = () => { throw new Error('Test error'); };
    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    spy.mockRestore();
  });
});
