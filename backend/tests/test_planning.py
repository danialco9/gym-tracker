from datetime import date
from itertools import pairwise

import pytest

from gym_tracker.analysis.recommendations import SINGLE_JOINT_LIFTS, is_compound
from gym_tracker.catalog import CATALOG
from gym_tracker.enums import PlanKind
from gym_tracker.planning import DayPlan, resolve_week, week_start
from gym_tracker.presets import MAX_TRAINING_DAYS, PRESET_ROUTINES, SPLITS, preset_week

# Monday 9 November 2026.
MONDAY = date(2026, 11, 9)


def test_a_week_starts_on_monday() -> None:
    assert week_start(date(2026, 11, 14)) == MONDAY
    assert week_start(MONDAY) == MONDAY


def test_the_usual_week_trains_its_days_and_rests_the_others() -> None:
    days = resolve_week(date(2026, 11, 12), {0: 7, 2: None}, {})

    assert [day.on_date for day in days] == [date(2026, 11, day) for day in range(9, 16)]
    assert [(day.kind, day.routine_id) for day in days[:3]] == [
        (PlanKind.ROUTINE, 7),
        (PlanKind.REST, None),
        (PlanKind.FREE, None),
    ]
    assert {day.kind for day in days[3:]} == {PlanKind.REST}
    assert not any(day.changed for day in days)


def test_a_change_replaces_the_usual_day_on_its_date_only() -> None:
    days = resolve_week(MONDAY, {0: 7}, {MONDAY: (PlanKind.REST, None), date(2026, 11, 10): (PlanKind.ROUTINE, 7)})

    assert days[0] == DayPlan(MONDAY, PlanKind.REST, None, changed=True)
    assert days[1] == DayPlan(date(2026, 11, 10), PlanKind.ROUTINE, 7, changed=True)
    # The next Monday follows the usual week again.
    assert resolve_week(date(2026, 11, 16), {0: 7}, {MONDAY: (PlanKind.REST, None)})[0].kind == PlanKind.ROUTINE


@pytest.mark.parametrize("count", range(1, MAX_TRAINING_DAYS + 1))
def test_every_number_of_days_has_a_split(count: int) -> None:
    assert len(SPLITS[count]) == count


def test_the_split_is_laid_on_the_days_in_calendar_order() -> None:
    week = preset_week([4, 0, 1, 3])

    assert [(weekday, routine.name) for weekday, routine in week] == [
        (0, "Torso"),
        (1, "Pierna"),
        (3, "Torso"),
        (4, "Pierna"),
    ]


@pytest.mark.parametrize("weekdays", [[], list(range(7))])
def test_the_split_needs_between_one_and_six_days(weekdays: list[int]) -> None:
    with pytest.raises(ValueError, match="training days"):
        preset_week(weekdays)


def test_from_four_days_two_sessions_in_a_row_never_share_a_routine() -> None:
    for count in range(4, MAX_TRAINING_DAYS + 1):
        split = SPLITS[count]
        assert all(first != second for first, second in pairwise(split))


def test_ready_made_routines_use_catalog_lifts_inside_the_progression_ranges() -> None:
    catalog = {exercise.slug: exercise for exercise in CATALOG}
    for routine in PRESET_ROUTINES:
        for item in routine.exercises:
            exercise = catalog[item.slug]
            compound = item.slug not in SINGLE_JOINT_LIFTS and is_compound(
                exercise.muscle_group, ";".join(exercise.secondary_muscles)
            )
            # 6-12 reps on multi-joint lifts and 8-12 on single-joint ones.
            assert (6 if compound else 8) <= item.reps <= 12, (routine.name, item.slug)
