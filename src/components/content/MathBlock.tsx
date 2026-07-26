import { cn } from '@/lib/utils';
import { renderMathToHtml } from '@/lib/math';

interface MathBlockProps {
  tex: string;
  plainText: string;
  displayMode?: boolean;
  className?: string;
}

export function MathBlock({
  tex,
  plainText,
  displayMode = true,
  className,
}: MathBlockProps) {
  if (plainText.trim() === '') {
    throw new Error('Math plain-text fallback must be non-empty');
  }

  const markup = renderMathToHtml(tex, displayMode);

  return (
    <div
      className={cn(
        'math-block max-w-full overflow-x-auto py-2 text-foreground',
        className
      )}
      role="math"
    >
      <span className="sr-only">{plainText}</span>
      <span
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    </div>
  );
}
