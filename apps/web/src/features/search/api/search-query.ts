export function sanitizeSearchQuery(query: string): string {
  return query
    .trim()
    .replace(/[\\%_,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}
