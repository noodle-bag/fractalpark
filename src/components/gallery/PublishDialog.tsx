'use client';

/**
 * Publish dialog (spec sections 3, 4.3): the owner confirms the frozen
 * public metadata — attribution display name (required once), title,
 * description — and attests to the current rights version before the
 * server creates the immutable publication. Nothing here is editable
 * afterwards except lifecycle state.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  CloudClientError,
  getDraft,
  getProfile,
  publishDraft,
  setDisplayName,
  type CloudDraftSummary,
} from '@/lib/cloud/client';
import { RIGHTS_ATTESTATION_VERSION } from '@/lib/cloud/attestation';
import { MIT_LICENSE_URL } from '@/lib/mit-license';
import { readFractalDocumentEnvelope } from '@/engine/document-envelope';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PublishDialogProps {
  draft: CloudDraftSummary | null;
  onClose: () => void;
  onPublished: () => void;
}

export function PublishDialog({ draft, onClose, onPublished }: PublishDialogProps) {
  const t = useTranslations('cloud.publish');
  const [displayName, setName] = useState('');
  const [needsName, setNeedsName] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [attested, setAttested] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True when the draft carries a portable formula asset: publishing then
  // freezes under MIT and the FRM source becomes public (spec §17.2).
  const [hasFormula, setHasFormula] = useState(false);

  // Reset and probe the profile whenever a new draft is targeted.
  useEffect(() => {
    if (!draft) return;
    setTitle(draft.title);
    setDescription('');
    setAttested(false);
    setError(null);
    setPending(false);
    setHasFormula(false);
    getProfile()
      .then((profile) => {
        const existing = profile.displayName ?? '';
        setName(existing);
        setNeedsName(existing.length === 0);
      })
      .catch(() => {
        setName('');
        setNeedsName(true);
      });
    getDraft(draft.id)
      .then((detail) => {
        const read = readFractalDocumentEnvelope(detail.envelope);
        setHasFormula(
          read.mode === 'editable' && (read.envelope.assets?.formulas?.length ?? 0) > 0,
        );
      })
      .catch(() => setHasFormula(false));
  }, [draft]);

  const submit = useCallback(async () => {
    if (!draft) return;
    setPending(true);
    setError(null);
    try {
      if (needsName) {
        const profile = await setDisplayName(displayName);
        if (!profile.displayName) throw new CloudClientError('validation_failed');
      }
      await publishDraft(draft.id, {
        expectedRevision: draft.revision,
        title,
        description,
        attestationVersion: RIGHTS_ATTESTATION_VERSION,
      });
      setPending(false);
      onPublished();
    } catch (value) {
      setPending(false);
      setError(value instanceof CloudClientError ? value.code : 'unavailable');
    }
  }, [description, displayName, draft, needsName, onPublished, title]);

  const errorMessage = (code: string): string => {
    switch (code) {
      case 'rate_limited':
        return t('errors.rateLimited');
      case 'formula_compile_failed':
        return t('errors.formulaCompile');
      case 'revision_conflict':
        return t('errors.revisionConflict');
      case 'validation_failed':
        return t('errors.validation');
      case 'offline':
        return t('errors.offline');
      default:
        return t('errors.generic');
    }
  };

  return (
    <Dialog open={draft !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {needsName && (
            <div className="space-y-2">
              <Label htmlFor="publish-display-name">{t('displayNameLabel')}</Label>
              <Input
                id="publish-display-name"
                value={displayName}
                maxLength={40}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('displayNamePlaceholder')}
              />
              <p className="text-xs text-muted-foreground">{t('displayNameHint')}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="publish-title">{t('titleLabel')}</Label>
            <Input
              id="publish-title"
              value={title}
              maxLength={80}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="publish-description">{t('descriptionLabel')}</Label>
            <textarea
              id="publish-description"
              value={description}
              maxLength={500}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          {hasFormula && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed">
              <p className="font-medium">{t('formulaNoticeTitle')}</p>
              <p className="mt-1">{t('formulaNoticeBody')}</p>
              <a
                href={MIT_LICENSE_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block underline"
              >
                {t('formulaNoticeLink')}
              </a>
            </div>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={attested}
              onChange={(event) => setAttested(event.target.checked)}
              className="mt-1"
            />
            <span>{t('attestation')}</span>
          </label>
          <p className="text-xs text-muted-foreground">{t('immutableHint')}</p>
          {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={
              pending ||
              !attested ||
              title.trim().length === 0 ||
              (needsName && displayName.trim().length === 0)
            }
          >
            {pending ? t('publishing') : t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
