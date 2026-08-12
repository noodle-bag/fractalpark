'use client';

/**
 * Cloud custom-formula library hook (v0.4.16, spec §17.1): the owner's
 * formula list lives in the cloud behind the session. Reads come from the
 * summary list; a formula's source is fetched on demand (canvas
 * resolution rescue, editor open, rename) and registered in memory so the
 * engine resolves it. Anonymous saves queue a single sign-in intent and
 * resume the exact frozen write after OTP — nothing ever writes browser
 * storage.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useCloudSession } from '@/components/cloud/CloudSessionProvider';
import {
  CloudClientError,
  changeCustomFormulaSemantics,
  createCustomFormula,
  deleteCustomFormula,
  getCustomFormula,
  listCustomFormulas,
  updateCustomFormula,
  type CloudCustomFormulaDetail,
  type CloudCustomFormulaSummary,
  type CustomFormulaSemanticsAction,
} from '@/lib/cloud/client';
import { resolveCustomFormula } from '@/lib/formula-resolver';
import type { FormulaExperienceHint } from '@/engine/frm/authoring';
import {
  resolveFrmSemanticsVersion,
  type FrmSemanticsVersion,
} from '@/engine/frm/semantics-version';

export type FormulaMutationCode =
  | 'ok'
  | 'auth-cancelled'
  | 'quota'
  | 'conflict'
  | 'not_found'
  | 'compile-failed'
  | 'builtin-conflict'
  | 'unavailable';

export interface FormulaMutationResult {
  success: boolean;
  code: FormulaMutationCode;
  formulaId?: string;
  error?: string;
}

function mapError(error: unknown): FormulaMutationResult {
  if (error instanceof CloudClientError) {
    switch (error.code) {
      case 'quota_exceeded':
        return { success: false, code: 'quota' };
      case 'revision_conflict':
        return { success: false, code: 'conflict' };
      case 'not_found':
        return { success: false, code: 'not_found' };
      case 'formula_compile_failed':
        return { success: false, code: 'compile-failed' };
      case 'formula_builtin_conflict':
        return { success: false, code: 'builtin-conflict' };
      default:
        break;
    }
  }
  return { success: false, code: 'unavailable' };
}

interface SaveInput {
  name: string;
  source: string;
  experienceHint?: FormulaExperienceHint;
  formulaId?: string;
}

export interface CloudFormulaLibrary {
  formulas: CloudCustomFormulaSummary[];
  isLoading: boolean;
  /** Fetch a formula's source and register it in memory. Returns false
   *  when the formula no longer exists or the cloud is unreachable. */
  ensureRegistered: (formulaId: string) => Promise<boolean>;
  /** Detail fetch for the editor (source + experience hint); registers
   *  the plugin as a side effect. Null on not_found/unavailable. */
  getDetail: (formulaId: string) => Promise<CloudCustomFormulaDetail | null>;
  /** Read-only detail fetch for semantics comparison. Never registers the
   *  formula or mutates the session-scoped asset registry. */
  inspectDetail: (formulaId: string) => Promise<CloudCustomFormulaDetail | null>;
  saveFormula: (input: SaveInput) => Promise<FormulaMutationResult>;
  renameFormula: (formulaId: string, name: string) => Promise<FormulaMutationResult>;
  deleteFormula: (formulaId: string) => Promise<FormulaMutationResult>;
  /** Explicit, reversible FRM semantics-version change (v1↔v2). */
  changeSemantics: (
    formulaId: string,
    action: CustomFormulaSemanticsAction,
  ) => Promise<FormulaMutationResult>;
  refresh: () => Promise<void>;
}

export function useCloudFormulaLibrary(): CloudFormulaLibrary {
  const { state: session, openSignIn } = useCloudSession();
  const [formulas, setFormulas] = useState<CloudCustomFormulaSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const revisionsRef = useRef(new Map<string, number>());
  const semanticsVersionsRef = useRef(new Map<string, FrmSemanticsVersion>());

  const refresh = useCallback(async () => {
    if (session.status !== 'authenticated') {
      setFormulas([]);
      revisionsRef.current = new Map();
      semanticsVersionsRef.current = new Map();
      setIsLoading(false);
      return;
    }
    try {
      const list = await listCustomFormulas();
      revisionsRef.current = new Map(list.map((item) => [item.id, item.revision]));
      semanticsVersionsRef.current = new Map(
        list.map((item) => [
          item.id,
          resolveFrmSemanticsVersion(item.frmSemanticsVersion),
        ]),
      );
      setFormulas(list);
    } catch {
      // Keep the previous list on transient failure; the UI surfaces the
      // session 'unavailable' state separately.
    } finally {
      setIsLoading(false);
    }
  }, [session.status]);

  useEffect(() => {
    if (session.status === 'loading') return;
    void refresh();
  }, [refresh, session.status]);

  const ensureRegistered = useCallback(async (formulaId: string): Promise<boolean> => {
    try {
      const detail = await getCustomFormula(formulaId);
      const resolved = resolveCustomFormula({
        id: detail.id,
        source: detail.source,
        experienceHint: (detail.experienceHint ?? undefined) as FormulaExperienceHint | undefined,
        frmSemanticsVersion: resolveFrmSemanticsVersion(
          detail.frmSemanticsVersion,
        ),
      });
      return resolved.success;
    } catch {
      return false;
    }
  }, []);

  const getDetail = useCallback(
    async (formulaId: string): Promise<CloudCustomFormulaDetail | null> => {
      try {
        const detail = await getCustomFormula(formulaId);
        resolveCustomFormula({
          id: detail.id,
          source: detail.source,
          experienceHint: (detail.experienceHint ?? undefined) as FormulaExperienceHint | undefined,
          frmSemanticsVersion: resolveFrmSemanticsVersion(
            detail.frmSemanticsVersion,
          ),
        });
        return detail;
      } catch {
        return null;
      }
    },
    [],
  );

  const inspectDetail = useCallback(
    async (formulaId: string): Promise<CloudCustomFormulaDetail | null> => {
      try {
        return await getCustomFormula(formulaId);
      } catch {
        return null;
      }
    },
    [],
  );

  const saveFormula = useCallback(
    async (input: SaveInput): Promise<FormulaMutationResult> => {
      const execute = async (): Promise<FormulaMutationResult> => {
        try {
          if (input.formulaId) {
            const revision = revisionsRef.current.get(input.formulaId);
            if (revision === undefined) return { success: false, code: 'not_found' };
            const result = await updateCustomFormula(input.formulaId, {
              expectedRevision: revision,
              name: input.name,
              source: input.source,
              ...(input.experienceHint !== undefined
                ? { experienceHint: input.experienceHint }
                : {}),
            });
            revisionsRef.current.set(input.formulaId, result.revision);
            resolveCustomFormula({
              id: input.formulaId,
              source: input.source,
              experienceHint: input.experienceHint,
              frmSemanticsVersion:
                semanticsVersionsRef.current.get(input.formulaId) ?? 1,
            });
            await refresh();
            return { success: true, code: 'ok', formulaId: input.formulaId };
          }
          const result = await createCustomFormula({
            name: input.name,
            source: input.source,
            ...(input.experienceHint !== undefined
              ? { experienceHint: input.experienceHint }
              : {}),
          });
          // Prefill the revision map before refresh so a failed refresh can
          // never strand the new id behind false not_found results (N1).
          revisionsRef.current.set(result.formulaId, result.revision);
          semanticsVersionsRef.current.set(result.formulaId, 2);
          resolveCustomFormula({
            id: result.formulaId,
            source: input.source,
            experienceHint: input.experienceHint,
            frmSemanticsVersion: 2,
          });
          await refresh();
          return { success: true, code: 'ok', formulaId: result.formulaId };
        } catch (error) {
          return mapError(error);
        }
      };

      if (session.status === 'authenticated') return execute();
      if (session.status === 'anonymous') {
        // Frozen write + single intent: the returned promise settles with
        // the REAL outcome after OTP (success carries the new id, so callers
        // can adopt recordId and avoid duplicate creates), or with
        // 'auth-cancelled' when the dialog closes without verifying.
        return new Promise<FormulaMutationResult>((resolve) => {
          openSignIn(
            () => execute().then(resolve),
            () => resolve({ success: false, code: 'auth-cancelled' }),
          );
        });
      }
      return { success: false, code: 'unavailable' };
    },
    [openSignIn, refresh, session.status],
  );

  const renameFormula = useCallback(
    async (formulaId: string, name: string): Promise<FormulaMutationResult> => {
      const revision = revisionsRef.current.get(formulaId);
      if (revision === undefined) return { success: false, code: 'not_found' };
      try {
        const result = await updateCustomFormula(formulaId, { expectedRevision: revision, name });
        revisionsRef.current.set(formulaId, result.revision);
        await refresh();
        return { success: true, code: 'ok', formulaId };
      } catch (error) {
        return mapError(error);
      }
    },
    [refresh],
  );

  const deleteFormula = useCallback(
    async (formulaId: string): Promise<FormulaMutationResult> => {
      const revision = revisionsRef.current.get(formulaId);
      if (revision === undefined) return { success: false, code: 'not_found' };
      try {
        await deleteCustomFormula(formulaId, revision);
        revisionsRef.current.delete(formulaId);
        await refresh();
        return { success: true, code: 'ok', formulaId };
      } catch (error) {
        return mapError(error);
      }
    },
    [refresh],
  );

  const changeSemantics = useCallback(
    async (
      formulaId: string,
      action: CustomFormulaSemanticsAction,
    ): Promise<FormulaMutationResult> => {
      const revision = revisionsRef.current.get(formulaId);
      if (revision === undefined) return { success: false, code: 'not_found' };
      try {
        // Lock a local copy before the revision-checked write. The server
        // still re-reads and validates the same record under expectedRevision;
        // this copy lets a successful response update the active session
        // immediately without a second, fallible network read.
        const detail = await getCustomFormula(formulaId);
        if (detail.revision !== revision) {
          return { success: false, code: 'conflict' };
        }
        const result = await changeCustomFormulaSemantics(formulaId, action, revision);
        revisionsRef.current.set(formulaId, result.revision);
        semanticsVersionsRef.current.set(
          formulaId,
          result.frmSemanticsVersion,
        );
        resolveCustomFormula({
          id: detail.id,
          source: detail.source,
          experienceHint: (detail.experienceHint ?? undefined) as
            | FormulaExperienceHint
            | undefined,
          frmSemanticsVersion: result.frmSemanticsVersion,
        });
        await refresh();
        return { success: true, code: 'ok', formulaId };
      } catch (error) {
        return mapError(error);
      }
    },
    [refresh],
  );

  return {
    formulas,
    isLoading,
    ensureRegistered,
    getDetail,
    inspectDetail,
    saveFormula,
    renameFormula,
    deleteFormula,
    changeSemantics,
    refresh,
  };
}
