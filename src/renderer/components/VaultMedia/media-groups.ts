/**
 * Group saved media by filename.
 *
 * "beach-01.jpg", "Beach_2.png" and "beach (3).jpg" share the key "beach".
 * Names with nothing meaningful left (timestamps, hashes) never group, and a
 * key only becomes a group once at least two items share it.
 *
 * @module renderer/components/VaultMedia/media-groups
 */

const SEP = '[\\s_.-]';

// Applied repeatedly until nothing changes, so "sunset-scaled-1" → "sunset".
const SUFFIXES = [
  new RegExp(`${SEP}*\\(\\d+\\)$`, 'i'), // "name (2)"
  new RegExp(`${SEP}+copy$`, 'i'), // "name copy"
  new RegExp(`${SEP}*\\d+x\\d+$`, 'i'), // "name-150x150"
  /@\d+x$/i, // "name@2x"
  new RegExp(`${SEP}+(thumb|thumbnail|small|medium|large|scaled|orig|original|full|preview)$`, 'i'),
  new RegExp(`${SEP}*\\d+$`), // "name-01", "name3"
];

function stripName(name: string): string {
  const dot = name.lastIndexOf('.');
  let s = dot > 0 ? name.slice(0, dot) : name;
  for (let prev = ''; prev !== s;) {
    prev = s;
    for (const re of SUFFIXES) s = s.replace(re, '');
  }
  return s.replace(new RegExp(`${SEP}+`, 'g'), ' ').trim();
}

/** Normalized group key for a filename, or null when the name can't group. */
export function nameGroupKey(name: string): string | null {
  const key = stripName(name).toLowerCase();
  if ((key.match(/[a-z]/g) ?? []).length < 2) return null;
  if (/^[0-9a-f]{8,}$/.test(key.replace(/ /g, ''))) return null; // hash-like
  return key;
}

export interface NameGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/**
 * Split items into name groups (2+ members, most recently saved group first)
 * and the rest. Input order is kept inside each group and in `ungrouped`.
 */
export function groupByName<T extends { name: string; savedAt: number }>(
  items: T[],
): { groups: NameGroup<T>[]; ungrouped: T[] } {
  const byKey = new Map<string, T[]>();
  for (const item of items) {
    const key = nameGroupKey(item.name);
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), item]);
  }

  const groups: NameGroup<T>[] = [];
  const grouped = new Set<T>();
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    groups.push({ key, label: stripName(members[0]!.name), items: members });
    members.forEach((m) => grouped.add(m));
  }

  const latest = (g: NameGroup<T>) => Math.max(...g.items.map((i) => i.savedAt));
  groups.sort((a, b) => latest(b) - latest(a));

  return { groups, ungrouped: items.filter((i) => !grouped.has(i)) };
}
