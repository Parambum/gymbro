package com.gymbro.app.data

private fun group(muscle: MuscleGroup, names: List<String>): List<Exercise> =
    names.map { Exercise(id = slugify(it), name = it, muscle = muscle) }

/** Reference catalogue of standard barbell/dumbbell/machine movements. */
val BUILT_IN_EXERCISES: List<Exercise> = buildList {
    addAll(
        group(
            MuscleGroup.CHEST,
            listOf(
                "Barbell Bench Press",
                "Incline Barbell Bench Press",
                "Dumbbell Bench Press",
                "Incline Dumbbell Press",
                "Dumbbell Fly",
                "Cable Crossover",
                "Chest Dip",
                "Push-Up",
                "Machine Chest Press",
                "Pec Deck",
            ),
        ),
    )
    addAll(
        group(
            MuscleGroup.BACK,
            listOf(
                "Deadlift",
                "Barbell Row",
                "Pull-Up",
                "Chin-Up",
                "Lat Pulldown",
                "Seated Cable Row",
                "T-Bar Row",
                "Dumbbell Row",
                "Face Pull",
                "Straight-Arm Pulldown",
            ),
        ),
    )
    addAll(
        group(
            MuscleGroup.LEGS,
            listOf(
                "Back Squat",
                "Front Squat",
                "Romanian Deadlift",
                "Leg Press",
                "Bulgarian Split Squat",
                "Walking Lunge",
                "Leg Extension",
                "Lying Leg Curl",
                "Hip Thrust",
                "Goblet Squat",
                "Standing Calf Raise",
                "Seated Calf Raise",
            ),
        ),
    )
    addAll(
        group(
            MuscleGroup.SHOULDERS,
            listOf(
                "Overhead Press",
                "Seated Dumbbell Shoulder Press",
                "Arnold Press",
                "Lateral Raise",
                "Cable Lateral Raise",
                "Rear Delt Fly",
                "Upright Row",
                "Front Raise",
            ),
        ),
    )
    addAll(
        group(
            MuscleGroup.ARMS,
            listOf(
                "Barbell Curl",
                "Dumbbell Curl",
                "Hammer Curl",
                "Preacher Curl",
                "Incline Dumbbell Curl",
                "Cable Curl",
                "Close-Grip Bench Press",
                "Triceps Pushdown",
                "Overhead Triceps Extension",
                "Skullcrusher",
                "Triceps Dip",
            ),
        ),
    )
    addAll(
        group(
            MuscleGroup.CORE,
            listOf(
                "Plank",
                "Side Plank",
                "Hanging Leg Raise",
                "Cable Crunch",
                "Ab Wheel Rollout",
                "Russian Twist",
                "Bicycle Crunch",
                "Dead Bug",
            ),
        ),
    )
}

/**
 * Starting points, not logged data — picking one only pre-fills the exercise
 * list for a new session. Every set still starts empty.
 */
val ROUTINE_TEMPLATES: List<RoutineTemplate> = listOf(
    RoutineTemplate(
        id = "push-day",
        name = "Push Day",
        focus = "Chest · Shoulders · Triceps",
        exerciseIds = listOf(
            "barbell-bench-press",
            "overhead-press",
            "incline-dumbbell-press",
            "lateral-raise",
            "triceps-pushdown",
            "overhead-triceps-extension",
        ),
    ),
    RoutineTemplate(
        id = "pull-day",
        name = "Pull Day",
        focus = "Back · Biceps",
        exerciseIds = listOf(
            "deadlift",
            "pull-up",
            "barbell-row",
            "seated-cable-row",
            "face-pull",
            "barbell-curl",
        ),
    ),
    RoutineTemplate(
        id = "leg-day",
        name = "Leg Day",
        focus = "Quads · Hamstrings · Calves",
        exerciseIds = listOf(
            "back-squat",
            "romanian-deadlift",
            "leg-press",
            "lying-leg-curl",
            "standing-calf-raise",
        ),
    ),
    RoutineTemplate(
        id = "arnold-chest-back",
        name = "Arnold Split — Chest & Back",
        focus = "Antagonist supersets",
        exerciseIds = listOf(
            "barbell-bench-press",
            "barbell-row",
            "incline-dumbbell-press",
            "lat-pulldown",
            "dumbbell-fly",
            "seated-cable-row",
        ),
    ),
    RoutineTemplate(
        id = "arnold-shoulders-arms",
        name = "Arnold Split — Shoulders & Arms",
        focus = "Delts · Biceps · Triceps",
        exerciseIds = listOf(
            "overhead-press",
            "lateral-raise",
            "rear-delt-fly",
            "barbell-curl",
            "skullcrusher",
            "hammer-curl",
        ),
    ),
    RoutineTemplate(
        id = "arnold-legs",
        name = "Arnold Split — Legs & Lower Back",
        focus = "Squat · Hinge · Calves",
        exerciseIds = listOf(
            "back-squat",
            "romanian-deadlift",
            "leg-extension",
            "lying-leg-curl",
            "standing-calf-raise",
        ),
    ),
    RoutineTemplate(
        id = "upper-body",
        name = "Upper Body",
        focus = "Full upper split",
        exerciseIds = listOf(
            "barbell-bench-press",
            "barbell-row",
            "overhead-press",
            "lat-pulldown",
            "barbell-curl",
            "triceps-pushdown",
        ),
    ),
    RoutineTemplate(
        id = "lower-body",
        name = "Lower Body",
        focus = "Quads · Glutes · Hamstrings",
        exerciseIds = listOf(
            "back-squat",
            "hip-thrust",
            "bulgarian-split-squat",
            "lying-leg-curl",
            "seated-calf-raise",
        ),
    ),
    RoutineTemplate(
        id = "full-body",
        name = "Full Body",
        focus = "One compound per pattern",
        exerciseIds = listOf(
            "back-squat",
            "barbell-bench-press",
            "barbell-row",
            "overhead-press",
            "plank",
        ),
    ),
)
