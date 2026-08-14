/** Source-facing parsing and coordinate mapping for formatted FRM diagnostics. */

export interface ParsedFrmDiagnostic {
  prefix: string;
  line: number;
  col: number;
  message: string;
}

export interface FrmDiagnosticLocation {
  line: number;
  col: number;
}

export type FrmDiagnosticLocationMapper = (
  line: number,
  col: number,
) => FrmDiagnosticLocation;

const FORMATTED_FRM_DIAGNOSTIC_RE =
  /^((?:❌|⚠️)\s*)?Line (\d+), column (\d+): ([\s\S]*)$/;

export function parseFormattedFrmDiagnostic(
  diagnostic: string,
): ParsedFrmDiagnostic | null {
  const match = FORMATTED_FRM_DIAGNOSTIC_RE.exec(diagnostic);
  if (!match) return null;
  return {
    prefix: match[1] ?? '',
    line: Number(match[2]),
    col: Number(match[3]),
    message: match[4],
  };
}

export function remapFormattedFrmDiagnostic(
  diagnostic: string,
  mapLocation?: FrmDiagnosticLocationMapper,
): string {
  const parsed = parseFormattedFrmDiagnostic(diagnostic);
  if (!parsed || !mapLocation) return diagnostic;
  const location = mapLocation(parsed.line, parsed.col);
  return `${parsed.prefix}Line ${location.line}, column ${location.col}: ${parsed.message}`;
}

export function primaryFrmDiagnosticMessage(message: string): string {
  return message.split('\n', 1)[0];
}
