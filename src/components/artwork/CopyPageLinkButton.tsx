'use client';

import { Check, Copy, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

interface CopyPageLinkButtonProps {
  labels: {
    copy: string;
    copied: string;
    error: string;
  };
}

type CopyStatus = 'idle' | 'copied' | 'error';

export function CopyPageLinkButton({ labels }: CopyPageLinkButtonProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  async function copyPageLink() {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API is unavailable');
      }
      await navigator.clipboard.writeText(window.location.href);
      setStatus('copied');
    } catch {
      setStatus('error');
    }

    resetTimer.current = window.setTimeout(() => {
      setStatus('idle');
      resetTimer.current = null;
    }, 2000);
  }

  const label = status === 'copied'
    ? labels.copied
    : status === 'error'
      ? labels.error
      : labels.copy;
  const Icon = status === 'copied'
    ? Check
    : status === 'error'
      ? TriangleAlert
      : Copy;

  return (
    <Button type="button" variant="outline" onClick={() => void copyPageLink()}>
      <Icon aria-hidden />
      <span aria-live="polite">{label}</span>
    </Button>
  );
}
