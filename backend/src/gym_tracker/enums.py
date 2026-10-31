"""Domain vocabularies shared by the catalog, API schemas and analytics."""

from enum import StrEnum


class MuscleGroup(StrEnum):
    CHEST = "chest"
    BACK = "back"
    LOWER_BACK = "lower_back"
    TRAPS = "traps"
    SHOULDERS = "shoulders"
    BICEPS = "biceps"
    TRICEPS = "triceps"
    FOREARMS = "forearms"
    ABS = "abs"
    QUADS = "quads"
    HAMSTRINGS = "hamstrings"
    GLUTES = "glutes"
    ADDUCTORS = "adductors"
    ABDUCTORS = "abductors"
    CALVES = "calves"


class Equipment(StrEnum):
    BARBELL = "barbell"
    EZ_BAR = "ez_bar"
    DUMBBELL = "dumbbell"
    KETTLEBELL = "kettlebell"
    MACHINE = "machine"
    SMITH_MACHINE = "smith_machine"
    CABLE = "cable"
    BODYWEIGHT = "bodyweight"
    BAND = "band"


class TrainingGoal(StrEnum):
    LOSE_FAT = "lose_fat"
    BUILD_MUSCLE = "build_muscle"
    RECOMPOSITION = "recomposition"


class Sex(StrEnum):
    """Only to compare strength fairly: average strength differs a lot between men and women."""

    MALE = "male"
    FEMALE = "female"
