/**
 * Drop-set grouping. A drop set isn't a separate set — it's a continuation
 * of the set it was dropped from (reduce the weight, keep going). So DROP
 * sets fold into the preceding set instead of incrementing the set count.
 */

export interface DropGroup<T> {
  /** the leading (non-drop) set that owns the group */
  parent: T;
  /** 1-based set number shown to the user */
  number: number;
  /** drops performed right after the parent, in order (100 → 80 → 60 …) */
  drops: T[];
}

/**
 * Fold an exercise's sets (in chronological order) into groups: a run of
 * consecutive DROP sets attaches to the set before it. `sameParent` (used by
 * the history view, where multiple exercises interleave) restricts a drop to
 * attach only to a parent it truly belongs with — e.g. the same exercise.
 */
export function groupDropSets<T extends { setType: string }>(
  ordered: T[],
  sameParent?: (drop: T, parent: T) => boolean,
): DropGroup<T>[] {
  const groups: DropGroup<T>[] = [];
  for (const set of ordered) {
    const last = groups[groups.length - 1];
    if (set.setType === "DROP" && last && (!sameParent || sameParent(set, last.parent))) {
      last.drops.push(set);
    } else {
      groups.push({ parent: set, number: groups.length + 1, drops: [] });
    }
  }
  return groups;
}

/**
 * What the set about to be logged will be labelled, given its type. A DROP
 * continues the current set; anything else opens the next one.
 */
export function nextSetLabel(
  ordered: { setType: string }[],
  nextType: string,
): { number: number; isDrop: boolean } {
  const count = groupDropSets(ordered).length;
  if (nextType === "DROP" && count > 0) return { number: count, isDrop: true };
  return { number: count + 1, isDrop: false };
}
