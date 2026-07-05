/**
 * Formula Tab Component
 * M4.2 Phase 2.2
 * 
 * Combines FormulaBrowser with CustomFormulaList
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FormulaBrowser } from './FormulaBrowser';
import { CustomFormulaList } from './CustomFormulaList';
import type { FormulaPlugin } from '@/engine/plugins/types';
import type { FormulaExperienceHint, FormulaSelectionRequest } from '@/engine/frm/authoring';
import type { ViewBounds } from '@/engine/types';

interface FormulaTabProps {
  currentFormula: string;
  currentBounds?: ViewBounds;
  onFormulaChange: (formula: string) => void;
  onCustomFormulaSelect?: (selection: FormulaSelectionRequest) => void;
}

export function FormulaTab({ currentFormula, currentBounds, onFormulaChange, onCustomFormulaSelect }: FormulaTabProps) {
  const t = useTranslations('explore');
  const [activeTab, setActiveTab] = useState('builtin');

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
          <TabsTrigger value="builtin">
            {t('formula.builtin')}
          </TabsTrigger>
          <TabsTrigger value="custom">
            {t('formula.custom')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builtin" className="mt-4">
          <FormulaBrowser
            currentFormula={currentFormula}
            onFormulaChange={onFormulaChange}
          />
        </TabsContent>

        <TabsContent value="custom" className="mt-4">
          <CustomFormulaList
            currentBounds={currentBounds}
            onSelectFormula={handleSelectCustomFormula}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default FormulaTab;
