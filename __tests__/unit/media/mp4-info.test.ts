import { describe, it, expect } from 'vitest';
import { readMp4Info } from '../../../src/main/media/mp4-info';

function box(type: string, ...payload: Buffer[]): Buffer {
  const body = Buffer.concat(payload);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, 'ascii');
  return Buffer.concat([head, body]);
}

function mvhd(timescale: number, duration: number): Buffer {
  const b = Buffer.alloc(100);
  b.writeUInt32BE(timescale, 12); // version 0: flags(4) created(4) modified(4) timescale duration
  b.writeUInt32BE(duration, 16);
  return box('mvhd', b);
}

function tkhd(width: number, height: number): Buffer {
  const b = Buffer.alloc(84);
  b.writeUInt32BE(width << 16, 76); // 16.16 fixed point
  b.writeUInt32BE(height << 16, 80);
  return box('tkhd', b);
}

describe('readMp4Info', () => {
  it('reads duration and video dimensions from moov', () => {
    const file = Buffer.concat([
      box('ftyp', Buffer.from('isom0000')),
      box('moov', mvhd(1000, 15500), box('trak', tkhd(0, 0)), box('trak', tkhd(576, 1024))),
      box('mdat', Buffer.alloc(32)),
    ]);
    expect(readMp4Info(file)).toEqual({ duration: 15.5, width: 576, height: 1024 });
  });

  it('finds moov after mdat', () => {
    const file = Buffer.concat([box('mdat', Buffer.alloc(64)), box('moov', mvhd(600, 1800))]);
    expect(readMp4Info(file)).toEqual({ duration: 3, width: 0, height: 0 });
  });

  it('returns null for non-mp4 bytes', () => {
    expect(readMp4Info(Buffer.from('<html>not a video</html>'))).toBeNull();
    expect(readMp4Info(Buffer.alloc(0))).toBeNull();
  });
});
