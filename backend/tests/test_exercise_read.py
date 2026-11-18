import pytest

from gym_tracker.enums import Equipment, MuscleGroup
from gym_tracker.schemas import ExerciseRead


def _exercise(slug: str, muscle: MuscleGroup, secondary: list[MuscleGroup]) -> ExerciseRead:
    return ExerciseRead(
        id=1,
        slug=slug,
        name=slug,
        muscle_group=muscle,
        secondary_muscles=secondary,
        equipment=Equipment.BARBELL,
        is_custom=False,
    )


@pytest.mark.parametrize(
    ("exercise", "compound"),
    [
        (_exercise("back-squat", MuscleGroup.QUADS, [MuscleGroup.GLUTES, MuscleGroup.HAMSTRINGS]), True),
        (_exercise("bench-press", MuscleGroup.CHEST, [MuscleGroup.TRICEPS, MuscleGroup.SHOULDERS]), True),
        # Helped by other muscles, but still single-joint.
        (_exercise("barbell-curl", MuscleGroup.BICEPS, [MuscleGroup.FOREARMS]), False),
        (_exercise("pec-deck", MuscleGroup.CHEST, [MuscleGroup.SHOULDERS]), False),
        (_exercise("leg-extension", MuscleGroup.QUADS, []), False),
    ],
)
def test_is_compound_tells_the_multi_joint_lifts(exercise: ExerciseRead, compound: bool) -> None:
    assert exercise.is_compound is compound
    assert exercise.model_dump()["is_compound"] is compound
