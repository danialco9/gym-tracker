from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

from gym_tracker.catalog import CATALOG
from gym_tracker.importing import (
    CatalogEntry,
    CsvImportError,
    ImportedSet,
    Source,
    match_name,
    parse_workouts,
)

MADRID = ZoneInfo("Europe/Madrid")

# Layouts from each app's public export; the rows are made up.
STRONG_HEADER = (
    "Workout #,Date,Workout Name,Duration (sec),Exercise Name,Set Order,Weight (kg),Reps,RPE,"
    "Distance (meters),Seconds,Notes,Workout Notes\n"
)
STRONG = (
    STRONG_HEADER
    + """\
1,2024-01-15 10:30:00,Push,3900,Bench Press (Barbell),W,40,10,,,,,Buen día
1,2024-01-15 10:30:00,Push,3900,Bench Press (Barbell),1,80,8,8,,,,Buen día
1,2024-01-15 10:30:00,Push,3900,Bench Press (Barbell),2,82.5,6,9,,,,Buen día
1,2024-01-15 10:30:00,Push,3900,Bench Press (Barbell),Rest Timer,,,,,90,,Buen día
1,2024-01-15 10:30:00,Push,3900,Treadmill,1,,,,2000,600,,Buen día
2,2024-01-17 18:00:00,Pull,1h 5m,Pull Up,1,,10,,,,,
"""
)

STRONG_OLD_POUNDS = """\
Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE;Weight Unit
2023-03-01 09:00:00;Legs;45m;Squat (Barbell);1;225;5;;;;;;lbs
"""

HEVY = """\
"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"
"Pierna","15 Jan 2024, 10:30","15 Jan 2024, 11:40","","Squat (Barbell)",,"",0,"warmup",60,8,,,
"Pierna","15 Jan 2024, 10:30","15 Jan 2024, 11:40","","Squat (Barbell)",,"",1,"normal",100,5,,,8.5
"Pierna","15 Jan 2024, 10:30","15 Jan 2024, 11:40","","Plank",,"",0,"normal",,,,60,
"""

OWN = """﻿fecha;hora;rutina;ejercicio;serie;calentamiento;kg;reps;rir;notas\r
2026-11-18;18:30;Pierna;Sentadilla con barra;1;sí;20;8;;'=Rodilla bien\r
2026-11-18;18:30;Pierna;Sentadilla con barra;2;no;37,5;8;2;\r
"""


def test_reads_strong_with_warm_ups_duration_and_no_rest_timer_or_cardio_rows() -> None:
    parsed = parse_workouts(STRONG, MADRID)

    assert parsed.source is Source.STRONG
    assert parsed.skipped_rows == 2
    push, pull = parsed.workouts
    assert push.started_at == datetime(2024, 1, 15, 10, 30, tzinfo=MADRID)
    assert push.ended_at == push.started_at + timedelta(seconds=3900)
    assert push.notes == "Buen día"
    assert push.sets == [
        ImportedSet("Bench Press (Barbell)", 10, Decimal("40.00"), None, is_warmup=True),
        ImportedSet("Bench Press (Barbell)", 8, Decimal("80.00"), Decimal(8), is_warmup=False),
        ImportedSet("Bench Press (Barbell)", 6, Decimal("82.50"), Decimal(9), is_warmup=False),
    ]
    # An empty weight is a bodyweight set; "1h 5m" is the older way of writing the duration.
    assert pull.sets == [ImportedSet("Pull Up", 10, Decimal(0), None, is_warmup=False)]
    assert pull.ended_at == pull.started_at + timedelta(hours=1, minutes=5)


def test_reads_an_older_strong_file_with_semicolons_and_pounds() -> None:
    parsed = parse_workouts(STRONG_OLD_POUNDS, MADRID)

    assert parsed.source is Source.STRONG
    assert parsed.workouts[0].sets[0].weight_kg == Decimal("102.06")


def test_reads_hevy() -> None:
    parsed = parse_workouts(HEVY, MADRID)

    assert parsed.source is Source.HEVY
    assert parsed.skipped_rows == 1  # the plank is held for time, with no reps
    (workout,) = parsed.workouts
    assert workout.started_at == datetime(2024, 1, 15, 10, 30, tzinfo=MADRID)
    assert workout.ended_at == datetime(2024, 1, 15, 11, 40, tzinfo=MADRID)
    assert [(item.weight_kg, item.rpe, item.is_warmup) for item in workout.sets] == [
        (Decimal("60.00"), None, True),
        (Decimal("100.00"), Decimal("8.5"), False),
    ]


def test_reads_this_apps_own_export_back() -> None:
    parsed = parse_workouts(OWN, MADRID)

    assert parsed.source is Source.GYM_TRACKER
    (workout,) = parsed.workouts
    assert workout.started_at == datetime(2026, 11, 18, 18, 30, tzinfo=MADRID)
    assert workout.notes == "=Rodilla bien"
    assert workout.sets == [
        ImportedSet("Sentadilla con barra", 8, Decimal("20.00"), None, is_warmup=True),
        ImportedSet("Sentadilla con barra", 8, Decimal("37.50"), Decimal(8), is_warmup=False),
    ]


def test_workouts_come_oldest_first() -> None:
    newer_first = OWN + "2026-11-10;09:00;;Sentadilla con barra;1;no;30;5;;\r\n"

    parsed = parse_workouts(newer_first, MADRID)

    assert [workout.started_at.day for workout in parsed.workouts] == [10, 18]


@pytest.mark.parametrize("content", ["", "a,b,c\n1,2,3\n"])
def test_refuses_a_file_it_does_not_know(content: str) -> None:
    with pytest.raises(CsvImportError):
        parse_workouts(content, MADRID)


def test_refuses_an_unreadable_date() -> None:
    with pytest.raises(CsvImportError):
        parse_workouts(STRONG.replace("2024-01-17 18:00:00", "ayer"), MADRID)


ENTRIES = [CatalogEntry(index, entry.name, entry.slug, entry.equipment) for index, entry in enumerate(CATALOG, start=1)]
SLUG_BY_ID = {entry.id: entry.slug for entry in ENTRIES}


@pytest.mark.parametrize(
    ("name", "slug"),
    [
        ("Bench Press (Barbell)", "bench-press"),
        ("Bench Press (Dumbbell)", "dumbbell-bench-press"),
        ("Bench Press (Smith Machine)", "smith-bench-press"),
        ("Incline Bench Press (Barbell)", "incline-bench-press"),
        ("Incline Bench Press (Dumbbell)", "incline-dumbbell-press"),
        ("Squat (Barbell)", "back-squat"),
        ("Front Squat (Barbell)", "front-squat"),
        ("Deadlift (Barbell)", "deadlift"),
        ("Deadlift (Trap bar)", "trap-bar-deadlift"),
        ("Romanian Deadlift (Dumbbell)", "dumbbell-romanian-deadlift"),
        ("Overhead Press (Barbell)", "overhead-press"),
        ("Lateral Raise (Dumbbell)", "lateral-raise"),
        ("Lateral Raise (Cable)", "cable-lateral-raise"),
        ("Bicep Curl (Dumbbell)", "dumbbell-curl"),
        ("Bicep Curl (Barbell)", "barbell-curl"),
        ("Preacher Curl (Barbell)", "preacher-curl"),
        ("Hammer Curl (Dumbbell)", "hammer-curl"),
        ("Triceps Pushdown (Cable - Straight Bar)", "triceps-pushdown"),
        ("Lat Pulldown (Cable)", "lat-pulldown"),
        ("Lat Pulldown - Close Grip (Cable)", "close-grip-lat-pulldown"),
        ("Bent Over Row (Barbell)", "barbell-row"),
        ("Pull Up", "pull-up"),
        ("Chin Up", "chin-up"),
        ("Leg Press", "leg-press"),
        ("Leg Extension (Machine)", "leg-extension"),
        ("Seated Leg Curl (Machine)", "seated-leg-curl"),
        ("Hip Thrust (Barbell)", "hip-thrust"),
        ("Face Pull (Cable)", "face-pull"),
        ("Shrug (Dumbbell)", "dumbbell-shrug"),
        ("Hanging Leg Raise", "hanging-leg-raise"),
        ("Sentadilla con barra", "back-squat"),  # this app's own export
        ("sentadilla CON barra", "back-squat"),
    ],
)
def test_matches_common_names_from_the_apps(name: str, slug: str) -> None:
    match = match_name(name, ENTRIES)

    assert match.exercise_id is not None, f"{name} found no match; suggested {match.suggestions}"
    assert SLUG_BY_ID[match.exercise_id] == slug


@pytest.mark.parametrize("name", ["Calf Raise (Machine)", "Plank", "Burpee"])
def test_leaves_unclear_names_for_the_user_with_close_suggestions_when_there_are(name: str) -> None:
    match = match_name(name, ENTRIES)

    assert match.exercise_id is None
    assert len(match.suggestions) <= 5


def test_suggests_the_calf_raises_for_a_calf_raise() -> None:
    match = match_name("Calf Raise (Machine)", ENTRIES)

    suggested = {SLUG_BY_ID[option.id] for option in match.suggestions}
    assert {"standing-calf-raise", "seated-calf-raise"} <= suggested


def test_a_custom_exercise_matches_by_its_own_name() -> None:
    custom = CatalogEntry(999, "Plancha lastrada", "plancha-lastrada", None)

    assert match_name("Plancha lastrada", [*ENTRIES, custom]).exercise_id == 999


def test_does_not_suggest_exercises_that_share_a_single_word() -> None:
    calf = match_name("Calf Raise (Machine)", ENTRIES)
    sled = match_name("Sled Push", ENTRIES)

    assert "machine-lateral-raise" not in {SLUG_BY_ID[option.id] for option in calf.suggestions}
    assert not {SLUG_BY_ID[option.id] for option in sled.suggestions} & {"push-up", "wide-push-up"}
