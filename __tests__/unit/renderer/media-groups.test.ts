import { describe, it, expect } from 'vitest';
import { nameGroupKey, groupByName } from '../../../src/renderer/components/VaultMedia/media-groups';

describe('nameGroupKey', () => {
  it('drops the extension and trailing sequence numbers', () => {
    expect(nameGroupKey('beach-01.jpg')).toBe('beach');
    expect(nameGroupKey('Beach_2.PNG')).toBe('beach');
    expect(nameGroupKey('beach 3.webp')).toBe('beach');
    expect(nameGroupKey('beach (4).jpg')).toBe('beach');
  });

  it('drops copy markers and size/variant suffixes', () => {
    expect(nameGroupKey('sunset copy.jpg')).toBe('sunset');
    expect(nameGroupKey('sunset-150x150.jpg')).toBe('sunset');
    expect(nameGroupKey('sunset@2x.png')).toBe('sunset');
    expect(nameGroupKey('sunset_thumb.jpg')).toBe('sunset');
    expect(nameGroupKey('sunset-scaled-1.jpg')).toBe('sunset');
  });

  it('treats separators alike', () => {
    expect(nameGroupKey('red_barn-door.jpg')).toBe(nameGroupKey('Red Barn Door 7.jpg'));
  });

  it('returns null when nothing meaningful is left', () => {
    expect(nameGroupKey('1700000000.jpg')).toBeNull();
    expect(nameGroupKey('a8f3e2b1c9d04e7f.png')).toBeNull();
    expect(nameGroupKey('x.jpg')).toBeNull();
  });
});

describe('groupByName', () => {
  const item = (id: string, name: string, savedAt: number) => ({ id, name, savedAt });

  it('groups items that share a key and leaves singletons ungrouped', () => {
    const { groups, ungrouped } = groupByName([
      item('1', 'beach-1.jpg', 10),
      item('2', 'cat.png', 20),
      item('3', 'beach-2.jpg', 30),
      item('4', 'deadbeefcafe1234.jpg', 40),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe('beach');
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['1', '3']);
    expect(ungrouped.map((i) => i.id)).toEqual(['2', '4']);
  });

  it('labels a group with the first member name minus its suffix', () => {
    const { groups } = groupByName([item('1', 'Red_Barn-01.jpg', 1), item('2', 'red barn 2.jpg', 2)]);
    expect(groups[0]!.label).toBe('Red Barn');
  });

  it('orders groups by their most recent save', () => {
    const { groups } = groupByName([
      item('1', 'a-cat-1.jpg', 1), item('2', 'a-cat-2.jpg', 2),
      item('3', 'dog-1.jpg', 5), item('4', 'dog-2.jpg', 3),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['dog', 'a cat']);
  });

  it('leaves items rejected by canGroup ungrouped', () => {
    const media = [
      { ...item('1', 'clip-1.jpg', 1), type: 'image' },
      { ...item('2', 'clip-2.mp4', 2), type: 'video' },
      { ...item('3', 'clip-3.mp4', 3), type: 'video' },
    ];
    const { groups, ungrouped } = groupByName(media, (i) => i.type === 'image');
    expect(groups).toHaveLength(0);
    expect(ungrouped.map((i) => i.id)).toEqual(['1', '2', '3']);
  });
});
