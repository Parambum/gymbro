package com.gymbro.app.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Local persistence. Deliberately built on SharedPreferences + org.json, both
 * part of the framework, so the storage layer adds no third-party dependency.
 */
class GymBroRepository(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun loadHistory(): List<WorkoutSession> =
        readArray(KEY_HISTORY) { sessionFromJson(it) }

    fun saveHistory(sessions: List<WorkoutSession>) =
        writeArray(KEY_HISTORY, sessions) { sessionToJson(it) }

    fun loadActive(): WorkoutSession? {
        val raw = prefs.getString(KEY_ACTIVE, null) ?: return null
        return runCatching { sessionFromJson(JSONObject(raw)) }.getOrNull()
    }

    fun saveActive(session: WorkoutSession?) {
        prefs.edit().apply {
            if (session == null) remove(KEY_ACTIVE)
            else putString(KEY_ACTIVE, sessionToJson(session).toString())
        }.apply()
    }

    fun loadCustomExercises(): List<Exercise> =
        readArray(KEY_CUSTOM) { exerciseFromJson(it) }

    fun saveCustomExercises(exercises: List<Exercise>) =
        writeArray(KEY_CUSTOM, exercises) { exerciseToJson(it) }

    // --- plumbing -----------------------------------------------------------

    private fun <T> readArray(key: String, parse: (JSONObject) -> T): List<T> {
        val raw = prefs.getString(key, null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { i ->
                runCatching { parse(arr.getJSONObject(i)) }.getOrNull()
            }
        }.getOrDefault(emptyList())
    }

    private fun <T> writeArray(key: String, items: List<T>, encode: (T) -> JSONObject) {
        val arr = JSONArray()
        items.forEach { arr.put(encode(it)) }
        prefs.edit().putString(key, arr.toString()).apply()
    }

    private fun exerciseToJson(e: Exercise) = JSONObject().apply {
        put("id", e.id)
        put("name", e.name)
        put("muscle", e.muscle.label)
        put("custom", e.custom)
    }

    private fun exerciseFromJson(o: JSONObject) = Exercise(
        id = o.getString("id"),
        name = o.getString("name"),
        muscle = MuscleGroup.fromLabel(o.optString("muscle", "Chest")),
        custom = o.optBoolean("custom", false),
    )

    private fun setToJson(s: LoggedSet) = JSONObject().apply {
        put("id", s.id)
        // JSONObject.NULL keeps "not entered" distinct from zero on reload.
        put("weight", s.weight ?: JSONObject.NULL)
        put("reps", s.reps ?: JSONObject.NULL)
        put("completed", s.completed)
    }

    private fun setFromJson(o: JSONObject) = LoggedSet(
        id = o.getString("id"),
        weight = if (o.isNull("weight")) null else o.getDouble("weight"),
        reps = if (o.isNull("reps")) null else o.getInt("reps"),
        completed = o.optBoolean("completed", false),
    )

    private fun sessionExerciseToJson(ex: SessionExercise) = JSONObject().apply {
        put("id", ex.id)
        put("exerciseId", ex.exerciseId)
        put("name", ex.name)
        put("muscle", ex.muscle.label)
        put("sets", JSONArray().also { arr -> ex.sets.forEach { arr.put(setToJson(it)) } })
    }

    private fun sessionExerciseFromJson(o: JSONObject): SessionExercise {
        val setsArr = o.optJSONArray("sets") ?: JSONArray()
        return SessionExercise(
            id = o.getString("id"),
            exerciseId = o.getString("exerciseId"),
            name = o.getString("name"),
            muscle = MuscleGroup.fromLabel(o.optString("muscle", "Chest")),
            sets = (0 until setsArr.length()).map { setFromJson(setsArr.getJSONObject(it)) },
        )
    }

    private fun sessionToJson(s: WorkoutSession) = JSONObject().apply {
        put("id", s.id)
        put("name", s.name)
        put("startedAt", s.startedAt)
        put("finishedAt", s.finishedAt ?: JSONObject.NULL)
        put("totalVolume", s.totalVolume)
        put("totalSets", s.totalSets)
        put(
            "exercises",
            JSONArray().also { arr -> s.exercises.forEach { arr.put(sessionExerciseToJson(it)) } },
        )
    }

    private fun sessionFromJson(o: JSONObject): WorkoutSession {
        val exArr = o.optJSONArray("exercises") ?: JSONArray()
        return WorkoutSession(
            id = o.getString("id"),
            name = o.getString("name"),
            startedAt = o.getLong("startedAt"),
            finishedAt = if (o.isNull("finishedAt")) null else o.getLong("finishedAt"),
            totalVolume = o.optDouble("totalVolume", 0.0),
            totalSets = o.optInt("totalSets", 0),
            exercises = (0 until exArr.length()).map {
                sessionExerciseFromJson(exArr.getJSONObject(it))
            },
        )
    }

    private companion object {
        const val PREFS = "gymbro"
        const val KEY_HISTORY = "history"
        const val KEY_ACTIVE = "active"
        const val KEY_CUSTOM = "customExercises"
    }
}
