/**
 * Cardio enums, deliberately free of any Mongoose import.
 *
 * These are needed by client components (the log modal's discipline picker,
 * the feed's filter row). Importing them from `@/models/Activity` dragged
 * Mongoose into the browser bundle, where `models` is undefined and the page
 * died with "Cannot read properties of undefined (reading 'Activity')".
 * The model imports these; nothing here imports the model.
 */

export const ACTIVITY_TYPES = ["RUN", "RIDE", "WALK", "HIKE", "SWIM"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** How the activity got here — drives the badge on the feed card. */
export const ACTIVITY_SOURCES = ["MANUAL", "GPX", "LIVE", "STRAVA"] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];
