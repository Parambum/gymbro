package com.gymbro.app.data

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

const val DEFAULT_REST_SECONDS = 90

data class GymBroState(
    val hydrated: Boolean = false,
    val active: WorkoutSession? = null,
    val history: List<WorkoutSession> = emptyList(),
    val customExercises: List<Exercise> = emptyList(),
    /** Epoch ms the current rest period ends, or null when not resting. */
    val restEndsAt: Long? = null,
    /** Full length of the running rest period, for the progress bar. */
    val restTotalSeconds: Int? = null,
) {
    val allExercises: List<Exercise>
        get() = (BUILT_IN_EXERCISES + customExercises).sortedBy { it.name }
}

class GymBroViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = GymBroRepository(app)

    private val _state = MutableStateFlow(GymBroState())
    val state: StateFlow<GymBroState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val loaded = withContext(Dispatchers.IO) {
                Triple(repo.loadHistory(), repo.loadActive(), repo.loadCustomExercises())
            }
            _state.update {
                it.copy(
                    hydrated = true,
                    history = loaded.first,
                    active = loaded.second,
                    customExercises = loaded.third,
                )
            }
        }
    }

    // --- session lifecycle --------------------------------------------------

    fun startSession(name: String, exercises: List<Exercise>) {
        val session = WorkoutSession(
            id = newId("session"),
            name = name,
            startedAt = System.currentTimeMillis(),
            exercises = exercises.map(::buildSessionExercise),
        )
        _state.update { it.copy(active = session, restEndsAt = null, restTotalSeconds = null) }
        persistActive(session)
    }

    fun cancelSession() {
        _state.update { it.copy(active = null, restEndsAt = null, restTotalSeconds = null) }
        persistActive(null)
    }

    /**
     * Keeps only sets that were actually ticked off, and drops exercises left
     * empty. Returns null when nothing was completed — an empty session is
     * discarded rather than logged as a workout that never happened.
     */
    fun finishSession(): WorkoutSession? {
        val active = _state.value.active ?: return null

        val exercises = active.exercises
            .map { ex -> ex.copy(sets = ex.sets.filter { it.countable }) }
            .filter { it.sets.isNotEmpty() }

        if (exercises.isEmpty()) {
            cancelSession()
            return null
        }

        val trimmed = active.copy(exercises = exercises)
        val completed = trimmed.copy(
            finishedAt = System.currentTimeMillis(),
            totalVolume = trimmed.volume,
            totalSets = trimmed.completedSets,
        )

        val newHistory = listOf(completed) + _state.value.history
        _state.update {
            it.copy(
                active = null,
                history = newHistory,
                restEndsAt = null,
                restTotalSeconds = null,
            )
        }
        persistActive(null)
        persistHistory(newHistory)
        return completed
    }

    // --- editing the active session ----------------------------------------

    fun addExerciseToSession(exercise: Exercise) = mutateActive { session ->
        session.copy(exercises = session.exercises + buildSessionExercise(exercise))
    }

    fun removeExerciseFromSession(sessionExerciseId: String) = mutateActive { session ->
        session.copy(exercises = session.exercises.filterNot { it.id == sessionExerciseId })
    }

    fun addSet(sessionExerciseId: String) = mapExercise(sessionExerciseId) { ex ->
        ex.copy(sets = ex.sets + LoggedSet(id = newId("set")))
    }

    fun removeSet(sessionExerciseId: String, setId: String) =
        mapExercise(sessionExerciseId) { ex ->
            ex.copy(sets = ex.sets.filterNot { it.id == setId })
        }

    fun updateSetWeight(sessionExerciseId: String, setId: String, weight: Double?) =
        mapSet(sessionExerciseId, setId) { it.copy(weight = weight) }

    fun updateSetReps(sessionExerciseId: String, setId: String, reps: Int?) =
        mapSet(sessionExerciseId, setId) { it.copy(reps = reps) }

    /**
     * Ticks a set off and reports its new state. Completing a set left blank
     * fills it from [fallback] (last session's numbers) in the same update, so
     * the value and the tick cannot race.
     */
    fun toggleSetCompleted(
        sessionExerciseId: String,
        setId: String,
        fallback: LoggedSet?,
    ): Boolean {
        val current = _state.value.active
            ?.exercises?.firstOrNull { it.id == sessionExerciseId }
            ?.sets?.firstOrNull { it.id == setId }
        val next = !(current?.completed ?: false)

        mapSet(sessionExerciseId, setId) { set ->
            if (!next) set.copy(completed = false)
            else set.copy(
                completed = true,
                weight = set.weight ?: fallback?.weight,
                reps = set.reps ?: fallback?.reps,
            )
        }
        return next
    }

    // --- library ------------------------------------------------------------

    /** Returns null when the name is blank or already taken. */
    fun addCustomExercise(name: String, muscle: MuscleGroup): Exercise? {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return null

        val id = slugify(trimmed)
        val clash = BUILT_IN_EXERCISES.any { it.id == id } ||
            _state.value.customExercises.any { it.id == id }
        if (clash) return null

        val exercise = Exercise(id = id, name = trimmed, muscle = muscle, custom = true)
        val updated = _state.value.customExercises + exercise
        _state.update { it.copy(customExercises = updated) }
        persistCustom(updated)
        return exercise
    }

    fun deleteCustomExercise(exerciseId: String) {
        val updated = _state.value.customExercises.filterNot { it.id == exerciseId }
        _state.update { it.copy(customExercises = updated) }
        persistCustom(updated)
    }

    // --- rest timer ---------------------------------------------------------

    fun startRest(seconds: Int = DEFAULT_REST_SECONDS) {
        _state.update {
            it.copy(
                restEndsAt = System.currentTimeMillis() + seconds * 1000L,
                restTotalSeconds = seconds,
            )
        }
    }

    fun extendRest(seconds: Int) {
        _state.update {
            val base = it.restEndsAt ?: System.currentTimeMillis()
            it.copy(
                restEndsAt = base + seconds * 1000L,
                restTotalSeconds = (it.restTotalSeconds ?: 0) + seconds,
            )
        }
    }

    fun stopRest() {
        _state.update { it.copy(restEndsAt = null, restTotalSeconds = null) }
    }

    // --- plumbing -----------------------------------------------------------

    private fun buildSessionExercise(exercise: Exercise) = SessionExercise(
        id = newId("sx"),
        exerciseId = exercise.id,
        name = exercise.name,
        muscle = exercise.muscle,
        sets = List(3) { LoggedSet(id = newId("set")) },
    )

    private inline fun mutateActive(crossinline fn: (WorkoutSession) -> WorkoutSession) {
        var updated: WorkoutSession? = null
        _state.update { state ->
            val active = state.active ?: return@update state
            updated = fn(active)
            state.copy(active = updated)
        }
        updated?.let(::persistActive)
    }

    private inline fun mapExercise(
        sessionExerciseId: String,
        crossinline fn: (SessionExercise) -> SessionExercise,
    ) = mutateActive { session ->
        session.copy(
            exercises = session.exercises.map { ex ->
                if (ex.id == sessionExerciseId) fn(ex) else ex
            },
        )
    }

    private inline fun mapSet(
        sessionExerciseId: String,
        setId: String,
        crossinline fn: (LoggedSet) -> LoggedSet,
    ) = mapExercise(sessionExerciseId) { ex ->
        ex.copy(sets = ex.sets.map { if (it.id == setId) fn(it) else it })
    }

    private fun persistActive(session: WorkoutSession?) {
        viewModelScope.launch(Dispatchers.IO) { repo.saveActive(session) }
    }

    private fun persistHistory(history: List<WorkoutSession>) {
        viewModelScope.launch(Dispatchers.IO) { repo.saveHistory(history) }
    }

    private fun persistCustom(exercises: List<Exercise>) {
        viewModelScope.launch(Dispatchers.IO) { repo.saveCustomExercises(exercises) }
    }
}
