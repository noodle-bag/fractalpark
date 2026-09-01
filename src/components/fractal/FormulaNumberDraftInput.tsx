'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const DEFAULT_FORMULA_NUMBER_STEP = 0.1;
const DECIMAL_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

interface FormulaNumberDraftInputProps {
  id?: string;
  ariaLabel: string;
  value: number;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
  invalidMessage: string;
  increaseLabel: string;
  decreaseLabel: string;
  className?: string;
}

function formatFormulaNumber(value: number): string {
  return String(Object.is(value, -0) ? 0 : value);
}

function parseFormulaNumberDraft(draft: string): number | null {
  const candidate = draft.trim();
  if (!DECIMAL_NUMBER_PATTERN.test(candidate)) return null;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampFormulaNumber(value: number, min?: number, max?: number): number {
  let bounded = value;
  if (min !== undefined) bounded = Math.max(min, bounded);
  if (max !== undefined) bounded = Math.min(max, bounded);
  return Object.is(bounded, -0) ? 0 : bounded;
}

function stepFormulaNumber(value: number, direction: -1 | 1): number {
  const stepped = value + direction * DEFAULT_FORMULA_NUMBER_STEP;
  const normalized = Number(stepped.toFixed(12));
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function FormulaNumberDraftInput({
  id,
  ariaLabel,
  value,
  min,
  max,
  onCommit,
  invalidMessage,
  increaseLabel,
  decreaseLabel,
  className,
}: FormulaNumberDraftInputProps) {
  const generatedId = useId();
  const errorId = `${id ?? generatedId}-error`;
  const legalValue = useRef(value);
  const [externalValue, setExternalValue] = useState(value);
  const [lastLegalValue, setLastLegalValue] = useState(value);
  const [draft, setDraft] = useState(() => formatFormulaNumber(value));
  const [invalid, setInvalid] = useState(false);

  if (!Object.is(externalValue, value)) {
    setExternalValue(value);
    setLastLegalValue(value);
    setDraft(formatFormulaNumber(value));
    setInvalid(false);
  }

  useEffect(() => {
    legalValue.current = value;
  }, [value]);

  const commitValue = (candidate: number) => {
    const bounded = clampFormulaNumber(candidate, min, max);
    const previousLegalValue = legalValue.current;
    legalValue.current = bounded;
    setLastLegalValue(bounded);
    setDraft(formatFormulaNumber(bounded));
    setInvalid(false);
    if (!Object.is(bounded, previousLegalValue)) onCommit(bounded);
  };

  const commitDraft = () => {
    const parsed = parseFormulaNumberDraft(draft);
    if (parsed === null) {
      setDraft(formatFormulaNumber(legalValue.current));
      setInvalid(true);
      return;
    }
    commitValue(parsed);
  };

  const commitStep = (direction: -1 | 1) => {
    const parsed = parseFormulaNumberDraft(draft);
    const base = parsed ?? legalValue.current;
    commitValue(stepFormulaNumber(base, direction));
  };

  const parsedDraft = parseFormulaNumberDraft(draft);
  const accessibleValue = clampFormulaNumber(parsedDraft ?? lastLegalValue, min, max);

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          role="spinbutton"
          step={DEFAULT_FORMULA_NUMBER_STEP}
          min={min}
          max={max}
          value={draft}
          aria-label={ariaLabel}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={accessibleValue}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            setInvalid(false);
          }}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitDraft();
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              commitStep(1);
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              commitStep(-1);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setDraft(formatFormulaNumber(legalValue.current));
              setInvalid(false);
            }
          }}
          className={cn('pr-8 font-mono text-sm', className)}
        />
        <span className="absolute inset-y-1 right-1 grid w-6 grid-rows-2 overflow-hidden rounded-sm border bg-background">
          <button
            type="button"
            tabIndex={-1}
            aria-label={`${ariaLabel} ${increaseLabel}`}
            aria-controls={id}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => commitStep(1)}
            className="flex items-center justify-center border-b text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <ChevronUp className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label={`${ariaLabel} ${decreaseLabel}`}
            aria-controls={id}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => commitStep(-1)}
            className="flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      </div>
      {invalid && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {invalidMessage}
        </p>
      )}
    </div>
  );
}
