'use client';

import { LogIn, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useCloudSession } from '@/components/cloud/CloudSessionProvider';
import { Button } from '@/components/ui/button';

/**
 * The single site-wide identity control (v0.4.16, ADR 0006 §9): anonymous
 * gets Sign in, authenticated gets Sign out in the same spot. The five
 * session states never lie — a cloud outage renders a disabled
 * "unavailable" indicator, never a Sign in prompt; the loading state is a
 * fixed-width skeleton so the navbar does not jump.
 */
export default function NavbarAuth() {
  const t = useTranslations('common.nav');
  const { state, openSignIn, signOut } = useCloudSession();

  if (state.status === 'loading') {
    return (
      <div
        data-testid="navbar-auth-skeleton"
        className="h-9 w-20 animate-pulse rounded-md bg-muted"
        aria-hidden="true"
      />
    );
  }

  if (state.status === 'disabled') {
    // Cloud switched off at deployment: every cloud affordance stays
    // invisible, keeping the pre-cloud navbar byte-equivalent.
    return null;
  }

  if (state.status === 'unavailable') {
    return (
      <Button variant="ghost" size="sm" disabled className="min-h-11 text-muted-foreground">
        {t('cloudUnavailable')}
      </Button>
    );
  }

  if (state.status === 'authenticated') {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="min-h-11 gap-1.5"
        onClick={() => void signOut()}
      >
        <LogOut className="h-4 w-4" />
        {t('signOut')}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-11 gap-1.5"
      onClick={() => openSignIn()}
    >
      <LogIn className="h-4 w-4" />
      {t('signIn')}
    </Button>
  );
}
