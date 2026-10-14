/**
 * Turn what the user typed into a URL we're willing to store. Bare hosts get
 * https://. Only web and about: URLs are accepted so a bookmark can't carry a
 * javascript: or file: payload.
 */
export function normalizeBookmarkUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.hostname ? parsed.href : null;
    }
    if (parsed.protocol === 'about:') return parsed.href;
    return null;
  } catch {
    return null;
  }
}
