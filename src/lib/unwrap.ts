/** Django PMS endpoints return the body directly; older wrappers returned `{ data }`. Accept both. */
export function unwrap<T>(result: unknown): T | undefined {
  if (result && typeof result === 'object' && !Array.isArray(result) && 'data' in (result as Record<string, unknown>)) {
    return (result as { data: T }).data;
  }
  return result as T | undefined;
}
