package com.gymbro.app.data

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Epley formula. Exact at one rep and increasingly an estimate beyond ~10,
 * which is why the UI always labels it "est.".
 */
fun estimateOneRepMax(weight: Double, reps: Int): Double = when {
    reps <= 0 || weight <= 0.0 -> 0.0
    reps == 1 -> weight
    else -> weight * (1.0 + reps / 30.0)
}

data class PersonalRecord(
    val exerciseId: String,
    val name: String,
    val bestOneRepMax: Double,
    val bestWeight: Double,
    val bestReps: Int,
    val heaviestWeight: Double,
    val achievedAt: Long,
    val totalSets: Int,
)

fun buildPersonalRecords(history: List<WorkoutSession>): List<PersonalRecord> {
    val byExercise = LinkedHashMap<String, PersonalRecord>()

    for (session in history) {
        val finishedAt = session.finishedAt ?: continue
        for (ex in session.exercises) {
            for (set in ex.sets) {
                if (!set.countable) continue
                val weight = set.weight!!
                val reps = set.reps!!
                val oneRm = estimateOneRepMax(weight, reps)
                val existing = byExercise[ex.exerciseId]

                if (existing == null) {
                    byExercise[ex.exerciseId] = PersonalRecord(
                        exerciseId = ex.exerciseId,
                        name = ex.name,
                        bestOneRepMax = oneRm,
                        bestWeight = weight,
                        bestReps = reps,
                        heaviestWeight = weight,
                        achievedAt = finishedAt,
                        totalSets = 1,
                    )
                } else {
                    val better = oneRm > existing.bestOneRepMax
                    byExercise[ex.exerciseId] = existing.copy(
                        bestOneRepMax = if (better) oneRm else existing.bestOneRepMax,
                        bestWeight = if (better) weight else existing.bestWeight,
                        bestReps = if (better) reps else existing.bestReps,
                        heaviestWeight = maxOf(existing.heaviestWeight, weight),
                        achievedAt = if (better) finishedAt else existing.achievedAt,
                        totalSets = existing.totalSets + 1,
                    )
                }
            }
        }
    }

    return byExercise.values.sortedByDescending { it.bestOneRepMax }
}

/**
 * Sets logged for this exercise the last time it was trained, used as the
 * "previous" reference beside each input. Null when there is no history —
 * the UI shows a dash rather than inventing a number.
 */
fun previousPerformance(
    history: List<WorkoutSession>,
    exerciseId: String,
): List<LoggedSet>? {
    return history
        .filter { it.finishedAt != null }
        .sortedByDescending { it.finishedAt }
        .firstNotNullOfOrNull { session ->
            session.exercises
                .firstOrNull { it.exerciseId == exerciseId }
                ?.sets
                ?.filter { it.countable }
                ?.takeIf { it.isNotEmpty() }
        }
}

fun totalVolume(history: List<WorkoutSession>): Double = history.sumOf { it.totalVolume }

fun formatVolume(kg: Double): String = when {
    kg >= 1_000_000 -> String.format(Locale.US, "%.1fM", kg / 1_000_000)
    kg >= 1_000 -> String.format(Locale.US, "%.1fk", kg / 1_000)
    else -> kg.roundToInt().toString()
}

fun formatWeight(weight: Double): String =
    if (weight % 1.0 == 0.0) weight.toInt().toString()
    else String.format(Locale.US, "%.1f", weight)

fun formatDate(ts: Long): String =
    SimpleDateFormat("EEE d MMM", Locale.getDefault()).format(Date(ts))

fun formatDuration(ms: Long): String {
    val totalMinutes = (ms / 60_000L).coerceAtLeast(0L)
    val hours = totalMinutes / 60
    val minutes = totalMinutes % 60
    return if (hours > 0) "${hours}h ${minutes}m" else "${minutes}m"
}

fun formatClock(seconds: Int): String {
    val s = seconds.coerceAtLeast(0)
    return "%d:%02d".format(s / 60, s % 60)
}
