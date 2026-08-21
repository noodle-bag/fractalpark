import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertTeachingSelectionAssetV1,
  buildTeachingSemanticAnchorAsset,
  canonicalTeachingSemanticAnchorJson,
} from '../../scripts/generate-teaching-semantic-anchors';
import selectionAsset from '../../resources/formula-library/v1/teaching-selection.v1.json';

const anchorPath = join(
  process.cwd(),
  'resources/formula-library/v1/teaching-semantic-anchors.v1.json',
);

describe('teaching semantic anchors', () => {
  it('regenerates byte-identically from all 50 pinned published definitions', async () => {
    const generated = await buildTeachingSemanticAnchorAsset(process.cwd());
    expect(canonicalTeachingSemanticAnchorJson(generated)).toBe(
      readFileSync(anchorPath, 'utf8'),
    );
  });

  it('rejects duplicate identities and batch drift before reading runtime source', () => {
    const duplicate = structuredClone(selectionAsset);
    duplicate.rows[1].formulaId = duplicate.rows[0].formulaId;
    expect(() => assertTeachingSelectionAssetV1(duplicate)).toThrow(
      'teaching-anchor-selection-invalid',
    );

    const batchDrift = structuredClone(selectionAsset);
    batchDrift.batches[0].formulaIds[0] = batchDrift.rows[10].formulaId;
    expect(() => assertTeachingSelectionAssetV1(batchDrift)).toThrow(
      'teaching-anchor-selection-batch-invalid',
    );
  });

  it('binds every selected formula to nonempty globally unique semantic nodes', () => {
    const asset = JSON.parse(readFileSync(anchorPath, 'utf8')) as {
      schema: string;
      selectionSha256: string;
      rowCount: number;
      rows: Array<{
        formulaId: string;
        sourceRevision: string;
        semanticHash: string;
        anchorCount: number;
        anchors: Array<{
          nodeId: string;
          irPath: string;
          role: string;
          kind: string;
          nodeHash: string;
        }>;
      }>;
    };
    const selectionBytes = readFileSync(
      join(
        process.cwd(),
        'resources/formula-library/v1/teaching-selection.v1.json',
      ),
    );
    expect(asset).toMatchObject({
      schema: 'fractalpark-teaching-semantic-anchors/v1',
      selectionSha256: createHash('sha256').update(selectionBytes).digest('hex'),
      rowCount: 50,
    });
    expect(asset.rows).toHaveLength(50);

    const selectionById = new Map(
      selectionAsset.rows.map((row) => [row.formulaId, row]),
    );
    const nodeIds = new Set<string>();
    const roles = new Set<string>();
    for (const row of asset.rows) {
      expect(row).toMatchObject({
        sourceRevision: selectionById.get(row.formulaId)?.sourceRevision,
        semanticHash: selectionById.get(row.formulaId)?.semanticHash,
      });
      expect(row.anchorCount).toBe(row.anchors.length);
      expect(row.anchorCount).toBeGreaterThan(0);
      for (const anchor of row.anchors) {
        expect(anchor.nodeId).toBe(
          `frm-v1:${row.sourceRevision}:${anchor.irPath}`,
        );
        expect(anchor.kind.length).toBeGreaterThan(0);
        expect(anchor.nodeHash).toMatch(/^[a-f0-9]{64}$/);
        expect(nodeIds.has(anchor.nodeId)).toBe(false);
        nodeIds.add(anchor.nodeId);
        roles.add(anchor.role);
      }
    }
    expect(roles).toEqual(
      new Set([
        'parameter-use',
        'initialization',
        'iteration',
        'state',
        'branch',
        'termination',
        'expression',
      ]),
    );
  });
});
