/** Keep sparkle copy only when it is not a restatement of title/subtitle/overview. */
export function distinctSuggestion(
  raw: string | null | undefined,
  ...others: Array<string | null | undefined>
): string | null {
  const text = (raw || '').replace(/\s+/g, ' ').trim();
  if (!text || text.toLowerCase() === 'null') return null;
  const needle = text.toLowerCase();
  for (const other of others) {
    const value = (other || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (value && value === needle) return null;
  }
  return text;
}

export function optionalCopy(value: unknown, max = 280): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text.toLowerCase() === 'null') return null;
  return text.slice(0, max);
}
