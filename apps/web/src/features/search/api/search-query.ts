const MAX_SEARCH_QUERY_LENGTH = 120;

/** Normalize search text without stripping punctuation that users may need to find. */
export function sanitizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').slice(0, MAX_SEARCH_QUERY_LENGTH).trim();
}

/** Escape the SQL LIKE metacharacters while leaving the user's punctuation searchable literally. */
function escapeLikePattern(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

/** Quote a PostgREST value so commas, parentheses, dots, and quotes stay data, not filter syntax. */
function quotePostgrestValue(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

export function searchIlikePattern(query: string): string {
  return `%${escapeLikePattern(sanitizeSearchQuery(query))}%`;
}

export function buildIlikeOrFilter(columns: readonly string[], query: string): string {
  const pattern = quotePostgrestValue(searchIlikePattern(query));
  return columns.map((column) => `${column}.ilike.${pattern}`).join(',');
}
