export interface TextPart {
  text: string;
  isMatch: boolean;
}

/**
 * Split `text` around case-insensitive occurrences of `query`.
 * Plain indexOf, not RegExp: the query is user input, and "(" or ".*" must be literal.
 */
export function splitHighlight(text: string, query: string): TextPart[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [{ text, isMatch: false }];
  const haystack = text.toLowerCase();
  const parts: TextPart[] = [];
  let pos = 0;
  for (let hit = haystack.indexOf(needle); hit !== -1; hit = haystack.indexOf(needle, pos)) {
    if (hit > pos) parts.push({ text: text.slice(pos, hit), isMatch: false });
    parts.push({ text: text.slice(hit, hit + needle.length), isMatch: true });
    pos = hit + needle.length;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), isMatch: false });
  return parts;
}
