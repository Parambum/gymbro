import { create } from "zustand";
import type { MuscleGroupSlug } from "@/lib/data/exercise-catalog";

/**
 * Shared state between the R3F canvas and the DOM logging panel.
 * The 3D model writes hover/selection; the exercise picker reads it.
 */
interface AnatomyState {
  hovered: MuscleGroupSlug | null;
  selected: MuscleGroupSlug | null;
  /** bumps every select so the camera rig re-engages even on same zone */
  focusToken: number;
  /** true while the camera rig is animating toward a zone pose */
  focusActive: boolean;
  setHovered: (slug: MuscleGroupSlug | null) => void;
  select: (slug: MuscleGroupSlug) => void;
  clearSelection: () => void;
  releaseFocus: () => void;
}

export const useAnatomyStore = create<AnatomyState>((set) => ({
  hovered: null,
  selected: null,
  focusToken: 0,
  focusActive: false,
  setHovered: (slug) => set({ hovered: slug }),
  select: (slug) =>
    set((s) => ({
      selected: slug,
      focusToken: s.focusToken + 1,
      focusActive: true,
    })),
  clearSelection: () =>
    set((s) => ({ selected: null, focusToken: s.focusToken + 1, focusActive: true })),
  releaseFocus: () => set({ focusActive: false }),
}));
