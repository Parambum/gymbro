/**
 * The `FUEL_ENABLED` kill switch (§9).
 *
 * It was written to default OFF so the module could ship dark while it was
 * being built — the point being that a half-finished nutrition tracker must
 * never be able to disturb the strength tracker people already rely on.
 *
 * That phase is over: the module is built, tested and merged, so the default
 * is now ON. It remains a kill switch — setting `FUEL_ENABLED="false"` turns
 * the whole thing off again (nav entry gone, `/fuel` 404s, every
 * `/api/fuel/*` route refuses) without redeploying anything else.
 *
 * Server-only: this reads a non-`NEXT_PUBLIC_` variable, so a client component
 * must be *told* the answer (layout.tsx passes it into <Nav>) rather than
 * calling this.
 */
export function isFuelEnabled(): boolean {
  return process.env.FUEL_ENABLED !== "false";
}
