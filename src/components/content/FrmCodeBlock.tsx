import type { CopyCodeLabels } from './CopyCodeButton';
import { CopyCodeButton } from './CopyCodeButton';
import { cn } from '@/lib/utils';
import {
  highlightFrmSource,
  type FrmHighlightSegment,
} from '@/lib/frm-highlight';

interface FrmCodeBlockProps {
  source: string;
  label?: string;
  copyLabels?: CopyCodeLabels;
  highlight?: boolean;
  className?: string;
}

function plainSourceSegment(source: string): FrmHighlightSegment[] {
  return source === ''
    ? []
    : [{ from: 0, to: source.length, text: source }];
}

export function FrmCodeBlock({
  source,
  label,
  copyLabels,
  highlight = true,
  className,
}: FrmCodeBlockProps) {
  let segments: FrmHighlightSegment[];
  let highlighted = false;

  try {
    segments = highlight ? highlightFrmSource(source) : plainSourceSegment(source);
    highlighted = highlight;
  } catch {
    segments = plainSourceSegment(source);
  }

  return (
    <figure
      className={cn(
        'frm-code-block max-w-full overflow-hidden rounded-lg border bg-muted/30',
        className
      )}
    >
      {(label || copyLabels) && (
        <div className="flex min-h-9 items-center justify-between gap-3 border-b px-3 py-1.5">
          {label ? (
            <figcaption className="truncate text-xs font-medium text-muted-foreground">
              {label}
            </figcaption>
          ) : (
            <span />
          )}
          {copyLabels && (
            <CopyCodeButton source={source} labels={copyLabels} />
          )}
        </div>
      )}
      <pre
        className="max-w-full overflow-x-auto p-4 text-sm leading-6"
        data-highlighted={highlighted}
      >
        <code className="frm-code font-mono">
          {segments.map((segment) =>
            segment.className ? (
              <span
                className={segment.className}
                key={`${segment.from}-${segment.to}`}
              >
                {segment.text}
              </span>
            ) : (
              segment.text
            )
          )}
        </code>
      </pre>
    </figure>
  );
}
