/**
 * The `FUEL_ENABLED` kill switch (§9).
 *
 * The whole module ships dark: until the env var is explicitly "true", the
 * nav entry is absent, `/fuel` 404s, and every `/api/fuel/*` route refuses.
 * One variable turns the feature on for a deployment, and off again if it
 * misbehaves — without a redeploy of the strength tracker.
 *
 * Server-only: this reads a non-`NEXT_PUBLIC_` variable, so a client component
 * must be *told* the answer (layout.tsx passes it into <Nav>) rather than
 * calling this.
 */
export function isFuelEnabled(): boolean {
  return process.env.FUEL_ENABLED === "true";
}
