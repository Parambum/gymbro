package com.gymbro.app.data

import java.util.concurrent.atomic.AtomicLong

enum class MuscleGroup(val label: String) {
    CHEST("Chest"),
    BACK("Back"),
    LEGS("Legs"),
    SHOULDERS("Shoulders"),
    ARMS("Arms"),
    CORE("Core");

    companion object {
        fun fromLabel(label: String): MuscleGroup =
            entries.firstOrNull { it.label.equals(label, ignoreCase = true) } ?: CHEST
    }
}

data class Exercise(
    val id: String,
    val name: String,
    val muscle: MuscleGroup,
    val custom: Boolean = false,
)

/**
 * Weight and reps stay nullable until the user types them. They are never
 * defaulted to zero, so an untouched set can't masquerade as logged data.
 */
data class LoggedSet(
    val id: String,
    val weight: Double? = null,
    val reps: Int? = null,
    val completed: Boolean = false,
) {
    /** A set counts only once ticked off with both numbers present. */
    val countable: Boolean get() = completed && weight != null && reps != null

    val volume: Double get() = if (countable) weight!! * reps!! else 0.0
}

/**
 * Name and muscle are denormalised deliberately: history must stay readable
 * even if the exercise is later renamed or deleted from the library.
 */
data class SessionExercise(
    val id: String,
    val exerciseId: String,
    val name: String,
    val muscle: MuscleGroup,
    val sets: List<LoggedSet>,
)

data class WorkoutSession(
    val id: String,
    val name: String,
    val startedAt: Long,
    val exercises: List<SessionExercise>,
    /** Null while the session is still in progress. */
    val finishedAt: Long? = null,
    val totalVolume: Double = 0.0,
    val totalSets: Int = 0,
) {
    val volume: Double get() = exercises.sumOf { ex -> ex.sets.sumOf { it.volume } }
    val completedSets: Int get() = exercises.sumOf { ex -> ex.sets.count { it.countable } }
}

data class RoutineTemplate(
    val id: String,
    val name: String,
    val focus: String,
    val exerciseIds: List<String>,
)

private val idCounter = AtomicLong(0)

/** Collision-resistant enough for ids that never leave the device. */
fun newId(prefix: String): String =
    "${prefix}_${System.currentTimeMillis().toString(36)}_${idCounter.incrementAndGet().toString(36)}"

fun slugify(name: String): String =
    name.lowercase()
        .trim()
        .replace(Regex("[^a-z0-9]+"), "-")
        .trim('-')
