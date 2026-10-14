/**
 * MP4 header reading
 *
 * Streaming players (TikTok and friends) hand the <video> a blob: URL backed by
 * MediaSource, which can't be downloaded. The real file is one of the mp4s the
 * tab fetched; reading each candidate's duration and frame size lets us pick
 * the one that matches the element the user right-clicked.
 *
 * @module media/mp4-info
 */

export interface Mp4Info {
  /** Seconds */
  duration: number;
  /** Largest track frame size; 0 when there is no visual track */
  width: number;
  height: number;
}

interface Box { type: string; start: number; end: number }

function* boxes(buf: Buffer, start: number, end: number): Generator<Box> {
  let pos = start;
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    let header = 8;
    if (size === 1) {
      if (pos + 16 > end) return;
      size = Number(buf.readBigUInt64BE(pos + 8));
      header = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < header || pos + size > end) return;
    yield { type, start: pos + header, end: pos + size };
    pos += size;
  }
}

function find(buf: Buffer, start: number, end: number, type: string): Box | undefined {
  for (const b of boxes(buf, start, end)) if (b.type === type) return b;
  return undefined;
}

/** Duration and frame size from an mp4's moov box, or null if it isn't one. */
export function readMp4Info(buf: Buffer): Mp4Info | null {
  const moov = find(buf, 0, buf.length, 'moov');
  if (!moov) return null;
  const mvhd = find(buf, moov.start, moov.end, 'mvhd');
  if (!mvhd || mvhd.end - mvhd.start < 32) return null;

  const v1 = buf[mvhd.start] === 1;
  const timescale = buf.readUInt32BE(mvhd.start + (v1 ? 20 : 12));
  const rawDuration = v1 ? Number(buf.readBigUInt64BE(mvhd.start + 24)) : buf.readUInt32BE(mvhd.start + 16);
  if (!timescale) return null;

  let width = 0;
  let height = 0;
  for (const trak of boxes(buf, moov.start, moov.end)) {
    if (trak.type !== 'trak') continue;
    const tkhd = find(buf, trak.start, trak.end, 'tkhd');
    if (!tkhd) continue;
    const off = tkhd.start + (buf[tkhd.start] === 1 ? 88 : 76);
    if (off + 8 > tkhd.end) continue;
    const w = buf.readUInt32BE(off) >>> 16;
    const h = buf.readUInt32BE(off + 4) >>> 16;
    if (w * h > width * height) { width = w; height = h; }
  }

  return { duration: rawDuration / timescale, width, height };
}

/**
 * Whether a downloaded file is the one playing in an element. Duration must be
 * within half a second; frame size must match when the element reports one.
 */
export function matchesElement(info: Mp4Info, el: { duration: number; width: number; height: number }): boolean {
  if (!Number.isFinite(el.duration) || el.duration <= 0) return false;
  if (Math.abs(info.duration - el.duration) > 0.5) return false;
  if (el.width && el.height && info.width && (info.width !== el.width || info.height !== el.height)) return false;
  return true;
}
