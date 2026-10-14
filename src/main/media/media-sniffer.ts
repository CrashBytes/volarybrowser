/**
 * Media Sniffer
 *
 * Remembers, per tab and in memory only, the audio/video files the page has
 * fetched. "Save Video" uses this when the <video> plays a blob: (MediaSource)
 * stream: the file behind it is one of these URLs. Nothing is persisted, and a
 * tab's list is dropped when the tab closes.
 *
 * @module media/media-sniffer
 */

import { session, webContents, Session } from 'electron';

export interface SniffedMedia {
  url: string;
  mime: string;
}

const PER_TAB_LIMIT = 40;
// Segments of HLS/DASH streams are fragments, not whole files
const SEGMENT = /\.(m4s|ts|m3u8|mpd)(\?|$)/i;

export class MediaSniffer {
  private byTab = new Map<number, SniffedMedia[]>();

  install(ses: Session = session.defaultSession): void {
    ses.webRequest.onResponseStarted((details) => {
      const id = details.webContentsId;
      if (id == null || (details.statusCode !== 200 && details.statusCode !== 206)) return;
      const header = Object.entries(details.responseHeaders ?? {})
        .find(([k]) => k.toLowerCase() === 'content-type')?.[1]?.[0] ?? '';
      const mime = header.split(';')[0]!.trim().toLowerCase();
      if (!/^(video|audio)\//.test(mime) || mime === 'video/mp2t' || SEGMENT.test(details.url)) return;
      if (!/^https?:/.test(details.url)) return;
      this.record(id, { url: details.url, mime });
    });
  }

  /** Newest first */
  recent(webContentsId: number): SniffedMedia[] {
    return [...(this.byTab.get(webContentsId) ?? [])].reverse();
  }

  private record(id: number, media: SniffedMedia): void {
    let list = this.byTab.get(id);
    if (!list) {
      list = [];
      this.byTab.set(id, list);
      webContents.fromId(id)?.once('destroyed', () => this.byTab.delete(id));
    }
    const existing = list.findIndex((m) => m.url === media.url);
    if (existing !== -1) list.splice(existing, 1);
    list.push(media);
    if (list.length > PER_TAB_LIMIT) list.shift();
  }
}

export const mediaSniffer = new MediaSniffer();
