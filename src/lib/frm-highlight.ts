import { classHighlighter, highlightTree } from '@lezer/highlight';
import { frmLanguage } from '@/engine/frm/codemirror-language';

export interface FrmHighlightSegment {
  from: number;
  to: number;
  text: string;
  className?: string;
}

export function highlightFrmSource(source: string): FrmHighlightSegment[] {
  if (source === '') {
    return [];
  }

  const highlightedRanges: Array<{
    from: number;
    to: number;
    className: string;
  }> = [];
  const tree = frmLanguage.parser.parse(source);

  highlightTree(tree, classHighlighter, (from, to, className) => {
    highlightedRanges.push({ from, to, className });
  });

  const segments: FrmHighlightSegment[] = [];
  let cursor = 0;

  for (const range of highlightedRanges) {
    if (range.from > cursor) {
      segments.push({
        from: cursor,
        to: range.from,
        text: source.slice(cursor, range.from),
      });
    }
    segments.push({
      from: range.from,
      to: range.to,
      text: source.slice(range.from, range.to),
      className: range.className,
    });
    cursor = range.to;
  }

  if (cursor < source.length) {
    segments.push({
      from: cursor,
      to: source.length,
      text: source.slice(cursor),
    });
  }

  if (segments.map((segment) => segment.text).join('') !== source) {
    throw new Error('FRM highlighting did not preserve the original source');
  }

  return segments;
}
