'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface CopyCodeLabels {
  copy: string;
  copied: string;
  error: string;
}

interface CopyCodeButtonProps {
  source: string;
  labels: CopyCodeLabels;
}

type CopyStatus = 'idle' | 'copied' | 'error';

export function CopyCodeButton({
  source,
  labels,
}: CopyCodeButtonProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current);
      }
    };
  }, []);

  async function copySource(): Promise<void> {
    if (resetTimer.current !== null) {
      window.clearTimeout(resetTimer.current);
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API is unavailable');
      }
      await navigator.clipboard.writeText(source);
      setStatus('copied');
    } catch {
      setStatus('error');
    }

    resetTimer.current = window.setTimeout(() => {
      setStatus('idle');
      resetTimer.current = null;
    }, 2000);
  }

  const label =
    status === 'copied'
      ? labels.copied
      : status === 'error'
        ? labels.error
        : labels.copy;
  const Icon =
    status === 'copied' ? Check : status === 'error' ? TriangleAlert : Copy;

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="content-copy-button text-muted-foreground hover:text-foreground"
      onClick={() => void copySource()}
    >
      <Icon aria-hidden="true" />
      <span aria-live="polite">{label}</span>
    </Button>
  );
}
