/**
 * Page Images
 *
 * Finds every image on a page for "Save All Images to Vault" and decides
 * which ones are worth saving. The DOM walk runs in an isolated world; the
 * selection and the summary message are pure so they can be unit tested.
 *
 * @module page-images
 */

/** Images narrower or shorter than this are icons, spacers or tracking pixels. */
export const MIN_IMAGE_DIMENSION = 64;

/** An <img> as reported by the page probe. Size is 0 when not yet known. */
export interface PageImage {
  src: string;
  width: number;
  height: number;
}

export interface SkipCounts {
  /** blob:, javascript:, about: and empty sources the main process cannot fetch */
  unsupported: number;
  /** the same URL used more than once on the page */
  duplicate: number;
  /** already saved to the vault from this URL */
  inVault: number;
  /** smaller than MIN_IMAGE_DIMENSION on either side */
  tiny: number;
}

export interface BatchResult {
  saved: number;
  failed: number;
  skipped: SkipCounts;
}

/**
 * Runs in the page's isolated world. Collects every <img>, preferring the
 * resolved currentSrc (so srcset and <picture> pick the shown file) and
 * falling back to the lazy-load attributes galleries use before scroll.
 */
export const PAGE_IMAGES_SCRIPT = `(() => {
  const lazy = ['data-src', 'data-lazy-src', 'data-original', 'data-srcset'];
  const firstOf = (srcset) => (srcset || '').split(',')[0].trim().split(/\\s+/)[0] || '';
  return [...document.images].map((el) => {
    let src = el.currentSrc || el.src || '';
    if (!src || src.startsWith('data:image/gif') || src.startsWith('data:image/svg')) {
      for (const attr of lazy) {
        const v = el.getAttribute(attr);
        if (v) { src = attr.endsWith('srcset') ? firstOf(v) : v; break; }
      }
      try { src = src ? new URL(src, document.baseURI).href : ''; } catch { src = ''; }
    }
    return { src, width: el.naturalWidth || 0, height: el.naturalHeight || 0 };
  });
})()`;

function fetchable(src: string): boolean {
  return /^(https?:|data:image\/)/i.test(src);
}

function tiny(image: PageImage): boolean {
  return image.width > 0 && image.height > 0
    && (image.width < MIN_IMAGE_DIMENSION || image.height < MIN_IMAGE_DIMENSION);
}

/**
 * Choose which found images to save, in page order, one per URL, leaving out
 * what the vault already has and what is too small to be content.
 */
export function pickPageImages(found: PageImage[], inVault: Set<string>): { images: PageImage[]; skipped: SkipCounts } {
  const skipped: SkipCounts = { unsupported: 0, duplicate: 0, inVault: 0, tiny: 0 };
  const seen = new Set<string>();
  const images: PageImage[] = [];
  for (const image of found) {
    if (!fetchable(image.src)) { skipped.unsupported++; continue; }
    if (seen.has(image.src)) { skipped.duplicate++; continue; }
    seen.add(image.src);
    if (inVault.has(image.src)) { skipped.inVault++; continue; }
    if (tiny(image)) { skipped.tiny++; continue; }
    images.push(image);
  }
  return { images, skipped };
}

/** One line for the toast once a batch finishes. */
export function summarizeBatch(result: BatchResult): string {
  const notes: string[] = [];
  if (result.skipped.inVault) notes.push(`${result.skipped.inVault} already in vault`);
  if (result.failed) notes.push(`${result.failed} failed`);
  const suffix = notes.length ? ` (${notes.join(', ')})` : '';

  if (result.saved > 0) {
    return `${result.saved} image${result.saved === 1 ? '' : 's'} saved to vault${suffix}`;
  }
  if (result.failed) return `No images saved${suffix}`;
  if (result.skipped.inVault) return `No new images to save${suffix}`;
  return 'No images found on this page';
}

/** Run `worker` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}
