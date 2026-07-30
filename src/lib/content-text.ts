export function splitProseParagraphs(value: string): string[] {
  return value
    .split(/\r?\n[ \t]*\r?\n/)
    .map((paragraph) => paragraph.replace(/[ \t]*\r?\n[ \t]*/g, ' ').trim())
    .filter(Boolean);
}
