'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';

import { CanonicalSourceWorkspace } from '@/components/formulas/CanonicalSourceWorkspace';
import {
  getPublishedFormulaLibraryClient,
  type PublishedFormulaLibraryClient,
  type PublishedFormulaLibraryClientResult,
} from '@/lib/published-formula-library';
import {
  buildPublishedFormulaSourceReferenceV1,
  type PublishedFormulaSourceReferenceV1,
} from '@/lib/published-formula-source';

const UUID_V5 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface ExploreCanonicalSourceWorkspaceProps {
  readonly currentFormula: string;
  readonly displayName: string;
  readonly loadClient?: () => Promise<PublishedFormulaLibraryClientResult>;
}

interface ResolvedSource {
  readonly formulaKey: string;
  readonly reference: PublishedFormulaSourceReferenceV1;
  readonly loadSource: PublishedFormulaLibraryClient['loadSource'];
}

export function ExploreCanonicalSourceWorkspace({
  currentFormula,
  displayName,
  loadClient = getPublishedFormulaLibraryClient,
}: ExploreCanonicalSourceWorkspaceProps) {
  const locale = useLocale();
  const [resolved, setResolved] = useState<ResolvedSource>();
  const generation = useRef(0);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    void loadClient().then((clientResult) => {
      if (currentGeneration !== generation.current || !clientResult.ok) return;
      const row = UUID_V5.test(currentFormula)
        ? clientResult.value.get(currentFormula)
        : clientResult.value.resolveRuntimeAlias(currentFormula);
      if (!row) return;
      const next = buildPublishedFormulaSourceReferenceV1(row);
      if (next) {
        setResolved({
          formulaKey: currentFormula,
          reference: next,
          loadSource: clientResult.value.loadSource,
        });
      }
    });
    return () => {
      generation.current += 1;
    };
  }, [currentFormula, loadClient]);

  if (!resolved || resolved.formulaKey !== currentFormula) return null;
  const { reference } = resolved;
  const remixHref = `/${locale}/explore?open=standard-formula&formula=${encodeURIComponent(
    reference.formulaId,
  )}&intent=remix`;

  return (
    <CanonicalSourceWorkspace
      displayName={displayName}
      loadSource={resolved.loadSource}
      reference={reference}
      remixHref={remixHref}
      variant="explore"
    />
  );
}
