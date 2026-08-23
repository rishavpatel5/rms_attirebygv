/**
 * Pure key generators for the bulk-import catalog step. Extracted so the exact
 * slug/code + collision-suffix behaviour can be unit-tested with no database, and so
 * the set-based (in-memory) commit produces byte-identical results to the old
 * per-row, DB-probing version.
 *
 * Each function reserves its result into the `used` set (existing DB keys ∪ keys
 * already minted in this batch), mirroring how the old code probed the DB after every
 * insert.
 */

/** Product slug: base, base-1, base-2, … (suffix always appended to the base). */
export function nextUniqueSlug(base: string, used: Set<string>): string {
  let slug = base;
  let i = 1;
  while (used.has(slug)) slug = `${base}-${i++}`;
  used.add(slug);
  return slug;
}

/** Category slug: base, base-1, base-1-2, … (suffix compounds onto the current slug). */
export function nextUniqueCategorySlug(base: string, used: Set<string>): string {
  let slug = base;
  let i = 1;
  while (used.has(slug)) slug = `${slug}-${i++}`;
  used.add(slug);
  return slug;
}

/** Base size code from a label: uppercase, non-alphanumerics → "_", capped at 20 chars. */
export function sizeCodeBase(label: string): string {
  return label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 20);
}

/** Size code: base, then <code[:17]>_1, <that[:17]>_2, … (re-sliced + compounding, as before). */
export function nextUniqueSizeCode(label: string, used: Set<string>): string {
  let code = sizeCodeBase(label);
  let n = 1;
  while (used.has(code)) code = `${code.slice(0, 17)}_${n++}`;
  used.add(code);
  return code;
}
