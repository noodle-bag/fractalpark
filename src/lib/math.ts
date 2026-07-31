import katex from 'katex';

export function renderMathToHtml(
  tex: string,
  displayMode = true
): string {
  if (tex.trim() === '') {
    throw new Error('Math TeX must be non-empty');
  }

  return katex.renderToString(tex, {
    displayMode,
    output: 'htmlAndMathml',
    strict: 'error',
    throwOnError: true,
    trust: false,
  });
}
