/**
 * Formula Tab Component
 * Keeps the published Standard Library and cloud-backed My Formulas as
 * separate scopes. The Standard selector intentionally has no text search.
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CustomFormulaList } from './CustomFormulaList';
import { PublishedFormulaLibrary } from './PublishedFormulaLibrary';
import type { FormulaPlugin } from '@/engine/plugins/types';
import type { FormulaExperienceHint, FormulaSelectionRequest } from '@/engine/frm/authoring';
import type { ViewBounds } from '@/engine/types';
import type {
  PublishedFormulaBeforeApply,
  PublishedFormulaSelectionResult,
} from '@/lib/published-formula-selection';

interface FormulaTabProps {
  currentFormula: string;
  currentBounds?: ViewBounds;
  onFormulaChange: (formula: string) => void;
  onPublishedFormulaSelect: (
    formulaId: string,
    beforeApply?: PublishedFormulaBeforeApply,
  ) => Promise<PublishedFormulaSelectionResult>;
  onPublishedFormulaCancel?: () => void;
  onCustomFormulaSelect?: (selection: FormulaSelectionRequest) => void;
}

export function FormulaTab({ currentFormula, currentBounds, onPublishedFormulaSelect, onPublishedFormulaCancel, onFormulaChange, onCustomFormulaSelect }: FormulaTabProps) {
  const t = useTranslations('explore');
  const [activeTab, setActiveTab] = useState('standard');

  const handleSelectCustomFormula = (plugin: FormulaPlugin, experienceHint?: FormulaExperienceHint) => {
    if (onCustomFormulaSelect) {
      onCustomFormulaSelect({
        formulaId: plugin.id,
        experienceHint,
      });
      return;
    }

    onFormulaChange(plugin.id);
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="standard">
            {t('formula.standard')}
          </TabsTrigger>
          <TabsTrigger value="mine">
            {t('formula.mine')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="standard" className="mt-4">
          <PublishedFormulaLibrary
            currentFormula={currentFormula}
            onSelect={onPublishedFormulaSelect}
            onCancel={onPublishedFormulaCancel}
          />
        </TabsContent>

        <TabsContent value="mine" className="mt-4">
          <CustomFormulaList
            currentFormula={currentFormula}
            currentBounds={currentBounds}
            onSelectFormula={handleSelectCustomFormula}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default FormulaTab;
