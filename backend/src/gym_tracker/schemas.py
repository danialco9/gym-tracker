"""Request and response models of the HTTP API."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, ClassVar, Self
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

from gym_tracker.analysis.mesocycle import MAX_BLOCK_WEEKS, MIN_BLOCK_WEEKS
from gym_tracker.analysis.overload import OverloadVerdict
from gym_tracker.analysis.recommendations import SINGLE_JOINT_LIFTS, Action, Reason, VolumeStatus
from gym_tracker.analysis.recommendations import is_compound as is_multi_joint
from gym_tracker.analysis.strength import StrengthTier, Zone
from gym_tracker.enums import Equipment, MuscleGroup, PlanKind, Sex, TrainingGoal
from gym_tracker.plates import (
    DEFAULT_BAR_KG,
    DEFAULT_PLATES_KG,
    MAX_BAR_KG,
    MIN_BAR_KG,
    PLATE_SIZES_KG,
    normalize_plates,
)
from gym_tracker.presets import MAX_TRAINING_DAYS
from gym_tracker.push import MAX_REST_SECONDS, is_push_service
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


class PushKeysIn(BaseModel):
    p256dh: str = Field(min_length=1, max_length=200)
    auth: str = Field(min_length=1, max_length=100)


class PushSubscriptionIn(BaseModel):
    """What ``PushManager.subscribe()`` hands the browser, as ``subscription.toJSON()`` serialises it."""

    endpoint: str = Field(max_length=1000)
    keys: PushKeysIn

    @field_validator("endpoint")
    @classmethod
    def known_push_service(cls, value: str) -> str:
        if not is_push_service(value):
            raise ValueError("Not a push service endpoint")
        return value


class RestPushIn(BaseModel):
    endpoint: str = Field(max_length=1000)
    seconds: int = Field(ge=1, le=MAX_REST_SECONDS)
    # What comes next, e.g. "Press banca · serie 2 · 8 x 80 kg".
    body: str = Field(min_length=1, max_length=200)


class PushKeyRead(BaseModel):
    public_key: str


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
    sex: Sex | None
    nickname: str | None
    block_weeks: int | None
    # Where this week falls in the training block; null without blocks.
    block: BlockWeekRead | None = None
    # The bar and plates of the user's gym, the defaults until changed (plates.py).
    bar_kg: float
    plates_kg: list[float]
    created_at: datetime

    @field_validator("bar_kg", mode="before")
    @classmethod
    def default_bar(cls, value: object) -> object:
        return DEFAULT_BAR_KG if value is None else value

    @field_validator("plates_kg", mode="before")
    @classmethod
    def default_plates(cls, value: object) -> object:
        return list(DEFAULT_PLATES_KG) if value is None else value


class BlockWeekRead(BaseModel):
    week: int
    weeks: int
    is_deload: bool
    # Hard sets each main muscle aims for this week: it climbs through the block.
    target_hard_sets: int


class UserUpdate(PartialUpdate):
    # Null clears the goal, back to the general advice.
    goal: TrainingGoal | None = None
    # Null compares the user's lifts with everyone.
    sex: Sex | None = None
    # Letters, digits, "_" and "."; no spaces, so nobody can pose as an unnamed "Atleta 12".
    nickname: str | None = Field(default=None, pattern=NICKNAME_PATTERN)
    # Weeks per training block, deload included. Sending it (even the same value) starts a new block
    # this week; null stops using blocks.
    block_weeks: int | None = Field(default=None, ge=MIN_BLOCK_WEEKS, le=MAX_BLOCK_WEEKS)
    # Null goes back to the defaults.
    bar_kg: float | None = Field(default=None, ge=MIN_BAR_KG, le=MAX_BAR_KG)
    # Known sizes only, kept once each and heaviest first.
    plates_kg: list[float] | None = Field(default=None, max_length=len(PLATE_SIZES_KG) * 2)

    @field_validator("plates_kg")
    @classmethod
    def known_plates(cls, value: list[float] | None) -> list[float] | None:
        return None if value is None else normalize_plates(value)


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

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_compound(self) -> bool:
        """A multi-joint lift, by the same rule as the rep ranges: the app warms these up."""
        return self.slug not in SINGLE_JOINT_LIFTS and is_multi_joint(
            self.muscle_group, ";".join(self.secondary_muscles) or None
        )


# Routines


class RoutineSetIn(InputModel):
    target_reps: int | None = Field(default=None, ge=1, le=100)
    target_weight_kg: float | None = Field(default=None, ge=0, le=1000)
    target_rpe: float | None = Field(default=None, ge=1, le=10)


class RoutineExerciseIn(InputModel):
    exercise_id: int
    sets: list[RoutineSetIn] = Field(default_factory=list, max_length=20)
    # A superset with the next exercise; ignored on the last one, which has none.
    superset_with_next: bool = False


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
    superset_with_next: bool


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
    # The rep range of the user's goal for this exercise; null without a goal.
    rep_range: IntRangeRead | None = None


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


class MuscleWeekRead(BaseModel):
    """Hard sets of a main muscle so far this week, against the weekly range of the user's goal."""

    muscle_group: str
    hard_sets: float
    min_hard_sets: int
    max_hard_sets: int
    # This week's aim: the minimum, or a step on the way to the maximum when training in blocks.
    target_hard_sets: int
    # The whole week before: below a target that climbed, today's plan adds a set.
    last_week_hard_sets: float


class SetLoadRead(BaseModel):
    weight_kg: float
    reps: int


class ExerciseOverloadRead(BaseModel):
    """An exercise trained this week against its session before: beaten, matched or below."""

    exercise_id: int
    exercise_name: str
    verdict: OverloadVerdict
    current: SetLoadRead
    previous: SetLoadRead


class ProgressOverviewRead(BaseModel):
    activity: ActivityRead
    recommendations: list[RecommendationRead]
    personal_records: list[PersonalRecordRead]
    weekly_volume: list[WeeklyVolumeRead]
    volume_advice: list[VolumeAdviceRead]
    week_sets: list[MuscleWeekRead]
    week_overload: list[ExerciseOverloadRead]
    body_weight: BodyWeightRead


class StreakRead(BaseModel):
    current_days: int
    best_days: int
    last_workout_on: date | None
    at_risk: bool


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


# Ranking


class RankedExerciseRead(BaseModel):
    id: int
    name: str


class ZoneStandingRead(BaseModel):
    zone: Zone
    # All null while the user has no ranked lift in the zone.
    tier: StrengthTier | None
    progress: float | None
    percentile: float | None


class MyLiftRead(BaseModel):
    """One of the user's ranked exercises, with the set behind it; only ever shown to its owner."""

    exercise: RankedExerciseRead
    zone: Zone
    tier: StrengthTier
    progress: float
    # The share of gym-goers of the same body weight and sex who lift less, from 0 to 100.
    percentile: float
    # The set with the best estimated max; for pull-ups and dips, the weight added to the body.
    weight_kg: float
    reps: int


class MyRankingRead(BaseModel):
    needs_body_weight: bool
    # Every zone, in a fixed order.
    zones: list[ZoneStandingRead]
    # By zone, best first.
    lifts: list[MyLiftRead]


# Week plan

Weekday = Annotated[int, Field(ge=0, le=6)]


def _distinct_weekdays(weekdays: list[int]) -> list[int]:
    if len(set(weekdays)) != len(weekdays):
        raise ValueError("Each weekday can only appear once")
    return weekdays


class PlannedDayIn(InputModel):
    # Monday is 0.
    weekday: Weekday
    # None plans a free workout.
    routine_id: int | None = None


class PlannedDayRead(ORMModel):
    weekday: int
    routine_id: int | None


class UsualWeekIn(InputModel):
    """The training days of the usual week; the weekdays left out rest."""

    days: list[PlannedDayIn] = Field(max_length=7)

    @field_validator("days")
    @classmethod
    def distinct_days(cls, days: list[PlannedDayIn]) -> list[PlannedDayIn]:
        _distinct_weekdays([day.weekday for day in days])
        return days


class PresetWeekIn(InputModel):
    """The weekdays someone trains, to lay the ready-made split on them."""

    weekdays: list[Weekday] = Field(min_length=1, max_length=MAX_TRAINING_DAYS)

    @field_validator("weekdays")
    @classmethod
    def distinct_weekdays(cls, weekdays: list[int]) -> list[int]:
        return _distinct_weekdays(weekdays)


class PresetDayRead(BaseModel):
    """One day of the ready-made split, before it is applied."""

    weekday: int
    name: str
    # The exercise names, in order.
    exercises: list[str]


class PlanChangeIn(InputModel):
    kind: PlanKind
    # Required for a routine, and only for one.
    routine_id: int | None = None

    @model_validator(mode="after")
    def routine_matches_kind(self) -> Self:
        if (self.kind == PlanKind.ROUTINE) != (self.routine_id is not None):
            raise ValueError("A routine id is needed for a routine, and only for one")
        return self


class PlanMoveIn(InputModel):
    """Move what one date holds to another: the first one becomes a rest day."""

    from_date: date
    to_date: date

    @model_validator(mode="after")
    def different_dates(self) -> Self:
        if self.from_date == self.to_date:
            raise ValueError("The dates must differ")
        return self


class PlannedRoutineRead(BaseModel):
    id: int
    name: str
    exercise_count: int


class PlanDayRead(BaseModel):
    on_date: date
    kind: PlanKind
    routine: PlannedRoutineRead | None
    # Whether a change for this date replaced what the usual week holds.
    changed: bool
    # Whether any workout was logged on this date.
    trained: bool


class WeekPlanRead(BaseModel):
    # The Monday of the week.
    start: date
    today: date
    days: list[PlanDayRead]
