"""Workouts read from a CSV exported by Strong, Hevy or this app, and their exercises matched.

Pure functions, no database: the API puts the result in front of the user before saving anything.
The column layouts follow the apps' public exports; each reader looks columns up by name and
tolerates the variations between versions (comma or semicolon, kg or lb, extra columns).
"""

from __future__ import annotations

import csv
import io
import re
import unicodedata
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from enum import StrEnum
from zoneinfo import ZoneInfo

from gym_tracker.dictation import ExerciseOption, suggest

POUND_KG = Decimal("0.45359237")
MAX_REPS = 200
MAX_WEIGHT_KG = Decimal(1000)
MAX_SETS_PER_EXERCISE = 50
MAX_NAME_LENGTH = 100
MAX_NOTES_LENGTH = 2000
MAX_SUGGESTIONS = 5
# A suggestion shares at least half its words with the name: one shared "push" or "raise" is noise.
MIN_SUGGESTION_OVERLAP = 0.5
MAX_RPE = 10
# Shorter words ending in "s" are not plurals: "abs", "bus".
MIN_PLURAL_LENGTH = 4


class Source(StrEnum):
    GYM_TRACKER = "gym_tracker"
    STRONG = "strong"
    HEVY = "hevy"


class CsvImportError(ValueError):
    """The file is not one of the known exports."""


@dataclass(frozen=True)
class ImportedSet:
    exercise: str
    reps: int
    weight_kg: Decimal
    rpe: Decimal | None
    is_warmup: bool


@dataclass
class ImportedWorkout:
    started_at: datetime
    ended_at: datetime | None = None
    notes: str | None = None
    sets: list[ImportedSet] = field(default_factory=list)


@dataclass(frozen=True)
class ParsedFile:
    source: Source
    workouts: list[ImportedWorkout]
    # Rows that carried no set we can keep: cardio, rest timers, impossible numbers.
    skipped_rows: int


# --- Reading -------------------------------------------------------------------------------------


def _fold(value: str) -> str:
    """Lowercase without accents, for comparing names and headers."""
    stripped = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return stripped.lower().strip()


def _rows(content: str) -> tuple[set[str], list[dict[str, str]]]:
    """The folded header and the rows keyed by it, with whichever delimiter splits the header the most."""
    text = content.removeprefix("﻿")
    first_line = text.split("\n", 1)[0]
    delimiter = max((",", ";", "\t"), key=lambda candidate: len(next(csv.reader([first_line], delimiter=candidate))))
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    header = next(reader, None)
    if header is None:
        raise CsvImportError("The file is empty")
    keys = [_fold(name) for name in header]
    return set(keys), [dict(zip(keys, (cell.strip() for cell in row), strict=False)) for row in reader if any(row)]


def _number(value: str) -> Decimal | None:
    """``37,5`` and ``37.5`` alike; with both marks the comma separates thousands."""
    text = value.strip().replace(" ", "")
    if not text:
        return None
    text = text.replace(",", "") if "." in text else text.replace(",", ".")
    try:
        number = Decimal(text)
    except InvalidOperation:
        return None
    return number if number.is_finite() else None


def _reps(value: str) -> int | None:
    number = _number(value)
    if number is None or number != number.to_integral_value() or not 1 <= number <= MAX_REPS:
        return None
    return int(number)


def _rpe(value: Decimal | None) -> Decimal | None:
    return value if value is not None and 1 <= value <= MAX_RPE else None


def _local(moment: datetime, zone: ZoneInfo) -> datetime:
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=zone)


def _moment(value: str, zone: ZoneInfo, formats: Sequence[str] = ()) -> datetime:
    text = value.strip()
    for pattern in formats:
        try:
            return _local(datetime.strptime(text, pattern), zone)
        except ValueError:
            continue
    try:
        return _local(datetime.fromisoformat(text), zone)
    except ValueError as error:
        raise CsvImportError(f"Unreadable date: {value!r}") from error


def _duration(value: str) -> timedelta | None:
    """Strong writes ``3900`` seconds in newer files and ``1h 5m`` in older ones."""
    text = value.strip().lower()
    if not text:
        return None
    if text.isdigit():
        seconds = int(text)
    else:
        parts = {unit: int(amount) for amount, unit in re.findall(r"(\d+)\s*([hms])", text)}
        seconds = parts.get("h", 0) * 3600 + parts.get("m", 0) * 60 + parts.get("s", 0)
    return timedelta(seconds=seconds) if seconds > 0 else None


def _column(row_keys: Iterable[str], *candidates: str) -> str | None:
    keys = set(row_keys)
    return next((candidate for candidate in candidates if candidate in keys), None)


def _clean_name(value: str) -> str:
    # This app's own export puts a quote before text that would start a formula.
    return value.removeprefix("'").strip()[:MAX_NAME_LENGTH]


def _clean_notes(value: str | None) -> str | None:
    text = (value or "").removeprefix("'").strip()
    return text[:MAX_NOTES_LENGTH] or None


def _weight(value: str, *, pounds: bool) -> Decimal | None:
    """Kilos for a weight cell; an empty cell is a bodyweight set. None when out of range."""
    number = _number(value)
    if number is None:
        return Decimal(0) if not value.strip() else None
    kilos = (number * POUND_KG).quantize(Decimal("0.01")) if pounds else number.quantize(Decimal("0.01"))
    return kilos if 0 <= kilos <= MAX_WEIGHT_KG else None


@dataclass(frozen=True)
class _Row:
    """One set as the readers below see it, before it is grouped into its workout."""

    key: tuple[str, ...]
    started_at: datetime
    ended_at: datetime | None
    notes: str | None
    set: ImportedSet


def _gym_tracker_rows(rows: list[dict[str, str]], zone: ZoneInfo) -> Iterable[_Row | None]:
    for row in rows:
        reps = _reps(row.get("reps", ""))
        weight = _weight(row.get("kg", ""), pounds=False)
        name = _clean_name(row.get("ejercicio", ""))
        if reps is None or weight is None or not name:
            yield None
            continue
        rir = _number(row.get("rir", ""))
        started = _moment(f"{row.get('fecha', '')} {row.get('hora', '00:00')}", zone, ("%Y-%m-%d %H:%M",))
        yield _Row(
            key=(row.get("fecha", ""), row.get("hora", "")),
            started_at=started,
            ended_at=None,
            notes=_clean_notes(row.get("notas")),
            set=ImportedSet(
                exercise=name,
                reps=reps,
                weight_kg=weight,
                rpe=_rpe(None if rir is None else MAX_RPE - rir),
                is_warmup=_fold(row.get("calentamiento", "")) in {"si", "yes", "1", "true"},
            ),
        )


def _strong_rows(rows: list[dict[str, str]], zone: ZoneInfo) -> Iterable[_Row | None]:
    if not rows:
        return
    keys = rows[0].keys()
    weight_column = _column(keys, "weight (kg)", "weight (lbs)", "weight") or "weight"
    duration_column = _column(keys, "duration (sec)", "duration") or "duration"
    for row in rows:
        order = row.get("set order", "").strip().upper()
        reps = _reps(row.get("reps", ""))
        unit = _fold(row.get("weight unit", ""))
        pounds = weight_column == "weight (lbs)" or unit in {"lb", "lbs"}
        weight = _weight(row.get(weight_column, ""), pounds=pounds)
        name = _clean_name(row.get("exercise name", ""))
        # Rest timer and note rows carry no set; neither do cardio rows, which have no reps.
        if not (order.isdigit() or order in {"W", "D", "F"}) or reps is None or weight is None or not name:
            yield None
            continue
        started = _moment(row.get("date", ""), zone, ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"))
        duration = _duration(row.get(duration_column, ""))
        yield _Row(
            key=(row.get("date", ""), row.get("workout name", "")),
            started_at=started,
            ended_at=started + duration if duration else None,
            notes=_clean_notes(row.get("workout notes")),
            set=ImportedSet(
                exercise=name,
                reps=reps,
                weight_kg=weight,
                rpe=_rpe(_number(row.get("rpe", ""))),
                is_warmup=order == "W",
            ),
        )


HEVY_DATE_FORMATS = ("%d %b %Y, %H:%M", "%d %b %Y %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M")


def _hevy_rows(rows: list[dict[str, str]], zone: ZoneInfo) -> Iterable[_Row | None]:
    if not rows:
        return
    pounds = "weight_kg" not in rows[0] and "weight_lbs" in rows[0]
    weight_column = "weight_lbs" if pounds else "weight_kg"
    for row in rows:
        reps = _reps(row.get("reps", ""))
        weight = _weight(row.get(weight_column, ""), pounds=pounds)
        name = _clean_name(row.get("exercise_title", ""))
        if reps is None or weight is None or not name:
            yield None
            continue
        started = _moment(row.get("start_time", ""), zone, HEVY_DATE_FORMATS)
        ended = _moment(row["end_time"], zone, HEVY_DATE_FORMATS) if row.get("end_time") else None
        yield _Row(
            key=(row.get("start_time", ""), row.get("title", "")),
            started_at=started,
            ended_at=ended if ended is not None and ended >= started else None,
            notes=_clean_notes(row.get("description")),
            set=ImportedSet(
                exercise=name,
                reps=reps,
                weight_kg=weight,
                rpe=_rpe(_number(row.get("rpe", ""))),
                is_warmup=_fold(row.get("set_type", "")) == "warmup",
            ),
        )


Reader = Callable[[list[dict[str, str]], ZoneInfo], Iterable[_Row | None]]

# Each export is told apart by columns only it has.
READERS: tuple[tuple[Source, frozenset[str], Reader], ...] = (
    (Source.GYM_TRACKER, frozenset({"fecha", "hora", "ejercicio", "kg", "reps"}), _gym_tracker_rows),
    (Source.HEVY, frozenset({"start_time", "exercise_title", "reps"}), _hevy_rows),
    (Source.STRONG, frozenset({"date", "exercise name", "set order", "reps"}), _strong_rows),
)


def parse_workouts(content: str, zone: ZoneInfo) -> ParsedFile:
    """The workouts in an export, oldest first, each set numbered per exercise in file order."""
    header, rows = _rows(content)
    found = next((reading for reading in READERS if reading[1] <= header), None)
    if found is None:
        raise CsvImportError("Unknown file layout")
    source, _, reader = found

    workouts: dict[tuple[str, ...], ImportedWorkout] = {}
    counts: dict[tuple[tuple[str, ...], str], int] = {}
    skipped = 0
    for row in reader(rows, zone):
        if row is None:
            skipped += 1
            continue
        workout = workouts.setdefault(row.key, ImportedWorkout(started_at=row.started_at, ended_at=row.ended_at))
        workout.notes = workout.notes or row.notes
        number = counts.get((row.key, row.set.exercise), 0) + 1
        if number > MAX_SETS_PER_EXERCISE:
            skipped += 1
            continue
        counts[(row.key, row.set.exercise)] = number
        workout.sets.append(row.set)
    ordered = sorted(workouts.values(), key=lambda workout: workout.started_at)
    return ParsedFile(source=source, workouts=ordered, skipped_rows=skipped)


# --- Matching exercise names ---------------------------------------------------------------------


@dataclass(frozen=True)
class CatalogEntry:
    """An exercise the user can log, with what English names are matched against."""

    id: int
    name: str
    slug: str | None
    equipment: str | None


# Words in a slug or an English label that name the equipment, and the equipment they mean.
EQUIPMENT_WORDS: Mapping[str, str] = {
    "barbell": "barbell",
    "dumbbell": "dumbbell",
    "cable": "cable",
    "machine": "machine",
    "smith": "smith_machine",
    "smith machine": "smith_machine",
    "kettlebell": "kettlebell",
    "band": "band",
    "bodyweight": "bodyweight",
    "weighted": "bodyweight",
    "ez bar": "ez_bar",
}
# The EZ bar is a barbell to most apps.
COMPATIBLE_EQUIPMENT: Mapping[str, frozenset[str]] = {"barbell": frozenset({"barbell", "ez_bar"})}
FILLER_WORDS = frozenset({"bicep", "the", "a", "and", "with", "on", "of"})

# Common names in Strong and Hevy that no word-by-word rule reaches, folded.
ALIASES: Mapping[str, str] = {
    "squat (barbell)": "back-squat",
    "bent over row (barbell)": "barbell-row",
    "bent over row (dumbbell)": "dumbbell-row",
    "bent over one arm row (dumbbell)": "dumbbell-row",
    "skullcrusher (barbell)": "skull-crusher",
    "skullcrusher (ez bar)": "skull-crusher",
    "skullcrusher (dumbbell)": "dumbbell-skull-crusher",
    "overhead press (dumbbell)": "dumbbell-shoulder-press",
    "incline bench press (dumbbell)": "incline-dumbbell-press",
    "decline bench press (dumbbell)": "decline-dumbbell-press",
    "chest fly (dumbbell)": "dumbbell-fly",
    "chest fly (machine)": "pec-deck",
    "butterfly (pec deck)": "pec-deck",
    "chest fly (cable)": "cable-crossover",
    "cable crossover": "cable-crossover",
    "seated row (cable)": "seated-cable-row",
    "seated cable row - v grip (cable)": "seated-cable-row",
    "triceps extension (cable)": "overhead-cable-extension",
    "ab wheel": "ab-wheel-rollout",
    "standing calf raise (machine)": "standing-calf-raise",
    "seated calf raise (machine)": "seated-calf-raise",
    "standing military press (barbell)": "overhead-press",
    "shoulder press (barbell)": "overhead-press",
}


def _singular(word: str) -> str:
    if word.endswith(("ches", "shes", "sses", "xes")):
        return word[:-2]
    if word.endswith("s") and not word.endswith("ss") and len(word) >= MIN_PLURAL_LENGTH:
        return word[:-1]
    return word


def _core_words(text: str) -> frozenset[str]:
    words = (_singular(word) for word in re.findall(r"[a-z0-9]+", _fold(text)))
    return frozenset(word for word in words if word not in FILLER_WORDS)


@dataclass(frozen=True)
class _EnglishName:
    words: frozenset[str]
    equipment: str | None


def _english(name: str) -> _EnglishName:
    """``Bench Press (Dumbbell)`` as its core words and the equipment in brackets.

    An unknown label such as ``(Trap bar)`` joins the words instead, so it still tells entries apart.
    """
    folded = _fold(name)
    label_match = re.search(r"\(([^)]*)\)\s*$", folded)
    base = folded[: label_match.start()] if label_match else folded
    equipment = None
    words = set(_core_words(base))
    if label_match:
        label = label_match.group(1).split(" - ")[0].strip()
        if label in EQUIPMENT_WORDS:
            equipment = EQUIPMENT_WORDS[label]
        else:
            words |= _core_words(label)
    words -= {word for word in EQUIPMENT_WORDS if " " not in word}
    return _EnglishName(frozenset(words), equipment)


def _slug_words(slug: str) -> tuple[frozenset[str], bool]:
    """A slug's words without the equipment ones, and whether it named equipment at all."""
    words = _core_words(slug.replace("-", " "))
    core = frozenset(word for word in words if word not in EQUIPMENT_WORDS)
    return core, core != words


def _compatible(asked: str | None, entry: CatalogEntry) -> bool:
    if asked is None:
        return True
    return entry.equipment in COMPATIBLE_EQUIPMENT.get(asked, frozenset({asked}))


@dataclass(frozen=True)
class NameMatch:
    exercise_id: int | None
    suggestions: tuple[ExerciseOption, ...] = ()


def match_name(name: str, entries: Sequence[CatalogEntry]) -> NameMatch:
    """The exercise a name in the file stands for, or the closest ones when it is not clear.

    Same name (this app's export, a custom exercise) first, then a known alias, then the English
    words against the catalog's English slugs: all of them must agree, so a guess is never saved.
    """
    folded = _fold(name)
    for entry in entries:
        if _fold(entry.name) == folded:
            return NameMatch(entry.id)
    by_slug = {entry.slug: entry for entry in entries if entry.slug}
    if (alias := ALIASES.get(folded)) and alias in by_slug:
        return NameMatch(by_slug[alias].id)

    english = _english(name)
    exact: list[tuple[CatalogEntry, bool]] = []
    scored: list[tuple[tuple[bool, float], CatalogEntry]] = []
    for entry in entries:
        if not entry.slug:
            continue
        core, named_equipment = _slug_words(entry.slug)
        if not core or not english.words:
            continue
        overlap = len(core & english.words) / len(core | english.words)
        if overlap == 1 and _compatible(english.equipment, entry):
            exact.append((entry, named_equipment))
        if overlap >= MIN_SUGGESTION_OVERLAP:
            scored.append(((_compatible(english.equipment, entry), overlap), entry))
    if len(exact) == 1:
        return NameMatch(exact[0][0].id)
    # "Leg Press" with no equipment means the plain leg press, not the Smith machine one.
    plain = [entry for entry, named_equipment in exact if not named_equipment]
    if english.equipment is None and len(plain) == 1:
        return NameMatch(plain[0].id)

    scored.sort(key=lambda item: item[1].name)
    scored.sort(key=lambda item: item[0], reverse=True)
    suggestions = [ExerciseOption(entry.id, entry.name) for _, entry in scored[:MAX_SUGGESTIONS]]
    if not suggestions:
        options = [ExerciseOption(entry.id, entry.name) for entry in entries]
        suggestions = suggest(name, options, limit=MAX_SUGGESTIONS)
    return NameMatch(None, tuple(suggestions))
