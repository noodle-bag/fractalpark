import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NavbarAuth from '@/components/layout/NavbarAuth';
import enMessages from '../../messages/en.json';

interface MockSession {
  state: { status: string; userId?: string };
  openSignIn: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
}

let session: MockSession;

vi.mock('@/components/cloud/CloudSessionProvider', () => ({
  useCloudSession: () => session,
}));

function renderAuth(): void {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <NavbarAuth />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  session = {
    state: { status: 'loading' },
    openSignIn: vi.fn(),
    signOut: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
  };
});

describe('NavbarAuth five-state contract (ADR 0006)', () => {
  it('loading renders a fixed-width skeleton, no button', () => {
    renderAuth();
    expect(screen.getByTestId('navbar-auth-skeleton')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('disabled renders nothing (cloud affordances invisible)', () => {
    session.state = { status: 'disabled' };
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <NavbarAuth />
      </NextIntlClientProvider>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('unavailable renders a disabled indicator, never a Sign in prompt', () => {
    session.state = { status: 'unavailable' };
    renderAuth();
    const button = screen.getByRole('button');
    expect(button.textContent).toContain('Cloud unavailable');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('Sign in')).toBeNull();
    fireEvent.click(button);
    expect(session.openSignIn).not.toHaveBeenCalled();
  });

  it('anonymous renders Sign in and opens the OTP dialog', () => {
    session.state = { status: 'anonymous' };
    renderAuth();
    fireEvent.click(screen.getByText('Sign in'));
    expect(session.openSignIn).toHaveBeenCalledTimes(1);
  });

  it('authenticated renders Sign out in the same spot', () => {
    session.state = { status: 'authenticated', userId: 'u1' };
    renderAuth();
    expect(screen.queryByText('Sign in')).toBeNull();
    fireEvent.click(screen.getByText('Sign out'));
    expect(session.signOut).toHaveBeenCalledTimes(1);
  });
});
