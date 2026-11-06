// Quoting alone does not stop spreadsheet applications from evaluating formulas.
// Only the downloaded representation changes; stored material values stay intact.
export function safeCsvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
