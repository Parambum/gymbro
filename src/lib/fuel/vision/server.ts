import table from "@/lib/data/food-vision-classes.json";
import type { VisionClassTable, VisionFood } from "./classes";

/**
 * Every food the photo model can resolve to, by (source, sourceRef).
 *
 * The log route prefers the copy in MongoDB — that is the row search, recents
 * and favourites point at. This table is the fallback for a database that has
 * not been re-seeded since a source was added (INDB arrived with the model):
 * it holds the same published figures, so a photo log is never refused just
 * because a seed script has not run yet.
 */
const bySourceRef = new Map<string, VisionFood>();
for (const c of Object.values((table as VisionClassTable).classes)) {
  for (const f of [...c.items, ...c.alts]) bySourceRef.set(`${f.source}:${f.sourceRef}`, f);
}

export function bundledVisionFood(source: string, sourceRef: string): VisionFood | null {
  return bySourceRef.get(`${source}:${sourceRef}`) ?? null;
}
