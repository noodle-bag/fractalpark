'use client';

/**
 * Cloud session context for the creation workflow (spec: contextual OTP —
 * sign-in happens where identity is needed, never as a standalone page).
 * The provider probes the same-origin session once per full load; on
 * cloud-disabled deployments it reports 'disabled' and every cloud
 * affordance stays invisible, which keeps production byte-identical to
 * its current behavior.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { CloudClientError, getSession, logout, requestOtp, verifyOtp } from '@/lib/cloud/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type CloudSessionState =
  | { status: 'loading' }
  | { status: 'disabled' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; userId: string };

interface CloudSessionContextValue {
  state: CloudSessionState;
  openSignIn: () => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const CloudSessionContext = createContext<CloudSessionContextValue | null>(null);

export function useCloudSession(): CloudSessionContextValue {
  const value = useContext(CloudSessionContext);
  if (!value) {
    throw new Error('useCloudSession must be used within CloudSessionProvider');
  }
  return value;
}

type OtpPhase = 'email' | 'code';

function OtpDialog({ open, onClose, onVerified }: {
  open: boolean;
  onClose: () => void;
  onVerified: (userId: string) => void;
}) {
  const t = useTranslations('cloud.otp');
  const [phase, setPhase] = useState<OtpPhase>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase('email');
    setCode('');
    setPending(false);
    setError(null);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const errorMessage = useCallback(
    (errorValue: unknown): string => {
      if (errorValue instanceof CloudClientError) {
        switch (errorValue.code) {
          case 'rate_limited':
            return t('errors.rateLimited');
          case 'offline':
            return t('errors.offline');
          case 'cloud_disabled':
            return t('errors.disabled');
          case 'unauthenticated':
            return t('errors.wrongCode');
          default:
            return t('errors.generic');
        }
      }
      return t('errors.generic');
    },
    [t],
  );

  const submitEmail = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      await requestOtp(email.trim());
      setPhase('code');
    } catch (errorValue) {
      setError(errorMessage(errorValue));
    } finally {
      setPending(false);
    }
  }, [email, errorMessage]);

  const submitCode = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const session = await verifyOtp(email.trim(), code.trim());
      onVerified(session.userId);
      reset();
    } catch (errorValue) {
      setError(errorMessage(errorValue));
    } finally {
      setPending(false);
    }
  }, [code, email, errorMessage, onVerified, reset]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {phase === 'email' ? t('emailDescription') : t('codeDescription')}
          </DialogDescription>
        </DialogHeader>
        {phase === 'email' ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitEmail();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="cloud-otp-email">{t('emailLabel')}</Label>
              <Input
                id="cloud-otp-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('emailPlaceholder')}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? t('sending') : t('sendCode')}
            </Button>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitCode();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="cloud-otp-code">{t('codeLabel')}</Label>
              <Input
                id="cloud-otp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="••••••"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? t('verifying') : t('verify')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={pending}
              onClick={() => {
                setError(null);
                void submitEmail();
              }}
            >
              {t('resend')}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CloudSessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CloudSessionState>({ status: 'loading' });
  const [signInOpen, setSignInOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const session = await getSession();
      setState(session ? { status: 'authenticated', userId: session.userId } : { status: 'anonymous' });
    } catch (error) {
      if (error instanceof CloudClientError && error.code === 'cloud_disabled') {
        setState({ status: 'disabled' });
        return;
      }
      // Transport/config failures degrade to hiding cloud affordances; the
      // local workflow is unaffected and the next mount re-probes.
      setState({ status: 'disabled' });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((session) => {
        if (cancelled) return;
        setState(session ? { status: 'authenticated', userId: session.userId } : { status: 'anonymous' });
      })
      .catch(() => {
        if (cancelled) return;
        // cloud_disabled and transport/config failures both degrade to
        // hiding cloud affordances; the next mount re-probes.
        setState({ status: 'disabled' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openSignIn = useCallback(() => setSignInOpen(true), []);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } catch {
      // Logout is best-effort; the sealed cookie expiring covers the rest.
    }
    setState({ status: 'anonymous' });
  }, []);

  const value = useMemo<CloudSessionContextValue>(
    () => ({ state, openSignIn, signOut, refresh }),
    [state, openSignIn, signOut, refresh],
  );

  return (
    <CloudSessionContext.Provider value={value}>
      {children}
      <OtpDialog
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
        onVerified={() => {
          setSignInOpen(false);
          void refresh();
        }}
      />
    </CloudSessionContext.Provider>
  );
}
