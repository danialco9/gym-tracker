"""Request and response models of the HTTP API."""

from __future__ import annotations

from datetime import date, datetime
from typing import ClassVar, Self
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from gym_tracker.analysis.achievements import BadgeKind, MissionKind
from gym_tracker.analysis.recommendations import Action, Reason, VolumeStatus
from gym_tracker.enums import Equipment, MuscleGroup, TrainingGoal
from gym_tracker.slugs import SLUG_PATTERN
from gym_tracker.users import MIN_PASSWORD_LENGTH

NICKNAME_PATTERN = r"^[\w.]{3,20}$"


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class InputModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, use_enum_values=True)


class PartialUpdate(InputModel):
    """PATCH body: omitted fields stay unchanged; ``non_nullable_fields`` cannot be sent as null."""

    non_nullable_fields: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="after")
    def reject_nulls(self) -> Self:
        nulls = sorted(
            field
            for field in self.non_nullable_fields
            if field in self.model_fields_set and getattr(self, field) is None
        )
        if nulls:
            raise ValueError(f"Fields cannot be null: {', '.join(nulls)}")
        return self


# Auth and health


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    # "Mantener la sesión iniciada"; off unless ticked.
    remember: bool = False


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class FeedbackIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    page: str | None = Field(default=None, max_length=200)

    @field_validator("message")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("The message is empty")
        return value.strip()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=128)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=128)


class UserRead(ORMModel):
    id: int
    email: EmailStr
    goal: TrainingGoal | None
    nickname: str | None
    show_in_ranking: bool
    created_at: datetime


class UserUpdate(PartialUpdate):
    non_nullable_fields: ClassVar[frozenset[str]] = frozenset({"show_in_ranking"})

    # Null clears the goal, back to the general advice.
    goal: TrainingGoal | None = None
    # Letters, digits, "_" and "."; no spaces, so nobody can pose as an unnamed "Atleta 12".
    nickname: str | None = Field(default=None, pattern=NICKNAME_PATTERN)
    show_in_ranking: bool | None = None


class HealthRead(BaseModel):
    status: str
    database: str


# Exercises


class ExerciseCreate(InputModel):
    name: str = Field(min_length=1, max_length=100)
    slug: str | None = Field(default=None, max_length=100, pattern=SLUG_PATTERN)
    muscle_group: MuscleGroup
    secondary_muscles: list[MuscleGroup] = Field(default_factory=list, max_length=6)
    equipment: Equipment | None = None


class ExerciseUpdate(PartialUpdate):
    non_nullable_fields: ClassVar[frozenset[str]] = frozenset({"name", "muscle_group", "secondary_muscles"})

    name: str | None = Field(default=None, min_length=1, max_length=100)
    muscle_group: MuscleGroup | None = None
    secondary_muscles: list[MuscleGroup] | None = Field(default=None, max_length=6)
    equipment: Equipment | None = None


class ExerciseRead(ORMModel):
    id: int
    slug: str
    name: str
    muscle_group: MuscleGroup
    secondary_muscles: list[MuscleGroup]
    equipment: Equipment | None
    is_custom: bool


# Routines


class RoutineSetIn(InputModel):
    target_reps: int | None = Field(default=None, ge=1, le=100)
    target_weight_kg: float | None = Field(default=None, ge=0, le=1000)
    target_rpe: float | None = Field(default=None, ge=1, le=10)


class RoutineExerciseIn(InputModel):
    exercise_id: int
    sets: list[RoutineSetIn] = Field(default_factory=list, max_length=20)


class RoutineIn(InputModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    exercises: list[RoutineExerciseIn] = Field(default_factory=list, max_length=30)


class RoutineSetRead(ORMModel):
    set_number: int
    target_reps: int | None
    target_weight_kg: float | None
    target_rpe: float | None


class RoutineExerciseRead(ORMModel):
    id: int
    position: int
    exercise: ExerciseRead
    sets: list[RoutineSetRead]


class RoutineRead(ORMModel):
    id: int
    name: str
    description: str | None
    created_at: datetime
    exercises: list[RoutineExerciseRead]


# Dictation


class DictationIn(InputModel):
    text: str = Field(min_length=1, max_length=2000)


class DictationSetRead(BaseModel):
    """A set as it was read. Anything the text did not say comes back as null, to fill in by hand."""

    reps: int | None
    weight_kg: float | None
    rpe: float | None


class DictationSuggestion(BaseModel):
    id: int
    name: str


class DictationExerciseRead(BaseModel):
    """``exercise_id`` is null when the text did not settle on one exercise: the user picks it."""

    query: str
    name: str
    exercise_id: int | None
    sets: list[DictationSetRead]
    # The closest catalog entries, offered when there is no confident match.
    suggestions: list[DictationSuggestion] = []


class DictationRead(BaseModel):
    exercises: list[DictationExerciseRead]


# Workouts


class WorkoutSetIn(InputModel):
    exercise_id: int
    set_number: int = Field(ge=1, le=50)
    reps: int = Field(ge=0, le=200)
    weight_kg: float = Field(ge=0, le=1000)
    rpe: float | None = Field(default=None, ge=1, le=10)
    is_warmup: bool = False


class WorkoutIn(InputModel):
    # Idempotency key: a workout posted again with the same one is not saved a second time.
    client_id: UUID | None = None
    routine_id: int | None = None
    started_at: AwareDatetime
    ended_at: AwareDatetime | None = None
    notes: str | None = Field(default=None, max_length=2000)
    sets: list[WorkoutSetIn] = Field(default_factory=list, max_length=300)

    @model_validator(mode="after")
    def check_consistency(self) -> Self:
        if self.ended_at is not None and self.ended_at < self.started_at:
            raise ValueError("ended_at cannot be before started_at")
        keys = [(workout_set.exercise_id, workout_set.set_number) for workout_set in self.sets]
        if len(keys) != len(set(keys)):
            raise ValueError("Each exercise can use a set number only once")
        return self


class WorkoutSetRead(ORMModel):
    id: int
    exercise_id: int
    set_number: int
    reps: int
    weight_kg: float
    rpe: float | None
    is_warmup: bool


class WorkoutRead(ORMModel):
    id: int
    routine_id: int | None
    started_at: datetime
    ended_at: datetime | None
    notes: str | None
    sets: list[WorkoutSetRead]


class LastSessionRead(BaseModel):
    workout_id: int
    started_at: datetime
    sets: list[WorkoutSetRead]


# Body measurements

MEASUREMENT_FIELDS = ("weight_kg", "body_fat_pct", "waist_cm", "chest_cm", "arm_cm", "thigh_cm")


class BodyMeasurementIn(InputModel):
    measured_on: date
    weight_kg: float | None = Field(default=None, gt=0, le=500)
    body_fat_pct: float | None = Field(default=None, ge=0, le=100)
    waist_cm: float | None = Field(default=None, gt=0, le=300)
    chest_cm: float | None = Field(default=None, gt=0, le=300)
    arm_cm: float | None = Field(default=None, gt=0, le=300)
    thigh_cm: float | None = Field(default=None, gt=0, le=300)
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def require_a_measurement(self) -> Self:
        if all(getattr(self, field) is None for field in MEASUREMENT_FIELDS):
            raise ValueError(f"Provide at least one of: {', '.join(MEASUREMENT_FIELDS)}")
        return self


class BodyMeasurementRead(ORMModel):
    id: int
    measured_on: date
    weight_kg: float | None
    body_fat_pct: float | None
    waist_cm: float | None
    chest_cm: float | None
    arm_cm: float | None
    thigh_cm: float | None
    notes: str | None


# Progress analytics


class ActivityRead(BaseModel):
    workouts_total: int
    workouts_last_7_days: int
    workouts_last_28_days: int
    last_workout_on: date | None


class PerformedSetRead(BaseModel):
    reps: int
    weight_kg: float
    rpe: float | None


class PlannedSetRead(BaseModel):
    reps: int | None
    weight_kg: float | None


class RecommendationRead(BaseModel):
    """``target_sets`` is the routine plan (empty without one); ``suggested_sets`` always has weights.

    ``reason`` says why ``action`` was chosen and ``increment_kg`` is the load step used for this
    exercise, so the app can explain the suggestion.
    """

    exercise_id: int
    exercise_name: str
    action: Action
    reason: Reason
    increment_kg: float
    last_performed_on: date
    last_sets: list[PerformedSetRead]
    target_sets: list[PlannedSetRead]
    suggested_sets: list[PlannedSetRead]


class PersonalRecordRead(BaseModel):
    exercise_id: int
    exercise_name: str
    muscle_group: str
    sessions: int
    best_e1rm_kg: float
    best_e1rm_on: date
    max_weight_kg: float
    max_weight_on: date


class MuscleVolumeRead(BaseModel):
    muscle_group: str
    hard_sets: int
    volume_kg: float


class WeeklyVolumeRead(BaseModel):
    week_start: date
    muscles: list[MuscleVolumeRead]


class VolumeAdviceRead(BaseModel):
    """A main muscle trained outside ``min_hard_sets``-``max_hard_sets`` hard sets a week, on
    average over the last ``weeks`` complete weeks."""

    muscle_group: str
    average_hard_sets: float
    status: VolumeStatus
    weeks: int
    min_hard_sets: int
    max_hard_sets: int


class BodyWeightPointRead(BaseModel):
    measured_on: date
    weight_kg: float
    trend_kg: float


class BodyWeightRead(BaseModel):
    entries: list[BodyWeightPointRead]
    weekly_change_kg: float | None


class IntRangeRead(BaseModel):
    min: int
    max: int


class RangeRead(BaseModel):
    min: float
    max: float


class GoalPlanRead(BaseModel):
    goal: TrainingGoal
    compound_reps: IntRangeRead
    isolation_reps: IntRangeRead
    rpe: RangeRead
    rest_seconds: IntRangeRead
    weekly_hard_sets: IntRangeRead


class ProgressOverviewRead(BaseModel):
    activity: ActivityRead
    recommendations: list[RecommendationRead]
    personal_records: list[PersonalRecordRead]
    weekly_volume: list[WeeklyVolumeRead]
    volume_advice: list[VolumeAdviceRead]
    body_weight: BodyWeightRead


class LevelRead(BaseModel):
    number: int
    xp: int
    level_xp: int
    level_size_xp: int


class StreakRead(BaseModel):
    current_days: int
    best_days: int
    last_workout_on: date | None
    at_risk: bool


class MissionRead(BaseModel):
    kind: MissionKind
    progress: int
    target: int
    done: bool


class BadgeRead(BaseModel):
    kind: BadgeKind
    earned_on: date | None


class AchievementsRead(BaseModel):
    level: LevelRead
    streak: StreakRead
    missions: list[MissionRead]
    badges: list[BadgeRead]


class ExerciseSessionRead(BaseModel):
    workout_id: int
    performed_on: date
    best_e1rm_kg: float
    top_weight_kg: float
    working_sets: int
    total_reps: int
    volume_kg: float


class ExerciseProgressRead(BaseModel):
    exercise_id: int
    exercise_name: str
    sessions: list[ExerciseSessionRead]
