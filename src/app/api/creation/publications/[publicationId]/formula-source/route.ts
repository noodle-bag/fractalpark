/**
 * GET /api/creation/publications/[publicationId]/formula-source — public
 * download of the MIT-licensed FRM source frozen into a formula
 * publication (spec §17.2). 404 unless the publication is published and
 * carries a validated formula asset; the file name comes from the
 * compiled formula metadata, never from user input.
 */

import { jsonError, toErrorResponse } from '@/lib/cloud/api';
import { CloudApiError } from '@/lib/cloud/api';
import { getCommunityPublication } from '@/lib/cloud/community';
import { DraftServiceError } from '@/lib/cloud/drafts';
import { validateFormulaPublication } from '@/lib/cloud/formula-publish';
import { FORMULA_PUBLICATION_LICENSE } from '@/lib/cloud/publications';
import { readFractalDocumentEnvelope } from '@/engine/document-envelope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 60) : 'formula';
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ publicationId: string }> },
): Promise<Response> {
  try {
    const { publicationId } = await context.params;
    const publication = await getCommunityPublication(publicationId);
    if (publication.license !== FORMULA_PUBLICATION_LICENSE) {
      throw new CloudApiError('not_found');
    }
    const verdict = validateFormulaPublication(publication.envelope);
    if (!verdict.ok) {
      throw new CloudApiError('not_found');
    }
    const read = readFractalDocumentEnvelope(publication.envelope);
    if (read.mode !== 'editable') {
      throw new CloudApiError('not_found');
    }
    const asset = read.envelope.assets?.formulas?.[0];
    if (!asset) {
      throw new CloudApiError('not_found');
    }
    const filename = `${sanitizeFilename(verdict.formulaName)}.frm`;
    return new Response(asset.source, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'public, max-age=3600, immutable',
      },
    });
  } catch (error) {
    if (
      (error instanceof CloudApiError && error.code === 'not_found') ||
      (error instanceof DraftServiceError && error.code === 'not_found')
    ) {
      return jsonError(_request, 'not_found');
    }
    return toErrorResponse(_request, error);
  }
}
