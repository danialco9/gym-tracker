"""Turns a workout written in plain Spanish into sets ready to review.

The rule-based reader below understands the shorthand people actually write at the gym
("prensa 4x10 120", "press banca 12,10,8 a 60 rir 2"). It runs locally, so it always works and
costs nothing. ``WorkoutReader`` is the seam a language model plugs into later, for the sentences
the rules cannot reach; nothing outside this module changes when it does.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Protocol

MAX_SETS_PER_EXERCISE = 20
MAX_REPS = 200
MAX_WEIGHT_KG = 1000
MIN_RPE = 1.0
MAX_RPE = 10.0
# Below this share of the catalog name's words, a match is a coincidence rather than the exercise meant.
MIN_NAME_SCORE = 0.5
# How many near misses to offer when the text fits several exercises equally well.
MAX_SUGGESTIONS = 3

# Words that carry no exercise name: units, notation and the connectives around them.
STOPWORDS = frozenset(
    [
        "a",
        "al",
        "con",
        "de",
        "del",
        "e",
        "en",
        "el",
        "la",
        "las",
        "los",
        "un",
        "una",
        "y",
        "por",
        "serie",
        "series",
        "rep",
        "reps",
        "repeticion",
        "repeticiones",
        "rpe",
        "rir",
        "kg",
        "kgs",
        "kilo",
        "kilos",
        "k",
        "veces",
        "vez",
        "mas",
    ]
)

# "4x10", "4 x 10", and the same with a multiplication sign: the number of sets first.
_SETS_BY_REPS = re.compile(r"(?<!\d)(\d{1,2})\s*[x\u00d7]\s*(\d{1,3})(?!\d)", re.IGNORECASE)
# "12,10,8" or "12-10-8": one entry per set, for pyramids and drop sets.
_REP_LIST = re.compile(r"(?<!\d)\d{1,3}(?:\s*[,\-]\s*\d{1,3})+(?!\d)")
# A weight stated outright: "60 kg", "a 82,5", "con 20 kilos".
_WEIGHT = re.compile(
    r"(?:\b(?:a|con|de)\s+)?(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:kgs?|kilos?|k)\b|\b(?:a|con)\s+(\d{1,4}(?:[.,]\d{1,2})?)\b",
    re.IGNORECASE,
)
# Any leftover number, which is the weight once the repetitions have been taken out.
_BARE_NUMBER = re.compile(r"(?<![\d,.])(\d{1,4}(?:[.,]\d{1,2})?)(?![\d,.])")
# "rpe 8", or "rir 2" (reps left in reserve), which is stored as RPE 10 - RIR.
_EFFORT = re.compile(r"\b(rpe|rir)\s*(\d{1,2}(?:[.,]5)?)\b", re.IGNORECASE)
_LINE_SEPARATOR = re.compile(r"[\n;]+|\s+y\s+(?=\D)")


@dataclass(frozen=True)
class ExerciseOption:
    """A catalog entry the reader may match against."""

    id: int
    name: str


@dataclass(frozen=True)
class ReadSet:
    reps: int | None
    weight_kg: float | None
    rpe: float | None


@dataclass(frozen=True)
class ReadExercise:
    """One line of the dictation. ``exercise_id`` is None when no catalog name was close enough."""

    query: str
    name: str
    exercise_id: int | None
    sets: tuple[ReadSet, ...]
    # Closest catalog entries when ``exercise_id`` is None, for the user to choose from.
    suggestions: tuple[ExerciseOption, ...] = ()


class WorkoutReader(Protocol):
    def read(self, text: str, exercises: Sequence[ExerciseOption]) -> list[ReadExercise]: ...


def _fold(value: str) -> str:
    """Lowercase without accents, so "jalón" matches "jalon"."""
    stripped = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return stripped.lower()


def _words(value: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", _fold(value))


def _meaningful(value: str) -> list[str]:
    return [word for word in _words(value) if word not in STOPWORDS and len(word) > 1]


def _number(value: str) -> float:
    return float(value.replace(",", "."))


def _clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def _cut(text: str, match: re.Match[str]) -> str:
    """Removes a match, leaving a space so the words around it stay separate."""
    return f"{text[: match.start()]} {text[match.end() :]}"


def _ranked(
    query: str, exercises: Iterable[ExerciseOption]
) -> list[tuple[tuple[float, int, int, int], ExerciseOption]]:
    """Catalog entries that share wording with the query, best first.

    Scores by the share of the catalog name's own words the query mentions, so "prensa" reaches
    "Prensa de piernas" while a single shared word like "press" carries no match on its own.
    Spanish exercise names lead with the head noun, so matching it separates "Prensa de piernas"
    from "Gemelos en prensa".
    """
    asked = set(_meaningful(query))
    if not asked:
        return []
    scored = []
    for exercise in exercises:
        name_words = _meaningful(exercise.name)
        if not name_words:
            continue
        hits = sum(1 for word in name_words if word in asked)
        if hits == 0:
            continue
        key = (hits / len(name_words), int(name_words[0] in asked), hits, -len(name_words))
        if key[0] >= MIN_NAME_SCORE:
            scored.append((key, exercise))
    # Best score first; equal scores keep a stable alphabetical order.
    scored.sort(key=lambda item: item[1].name)
    scored.sort(key=lambda item: item[0], reverse=True)
    return scored


def match_exercise(query: str, exercises: Iterable[ExerciseOption]) -> ExerciseOption | None:
    """The one exercise the text settles on, or None when it does not.

    A tie is genuine ambiguity - "press banca" fits both the barbell and the dumbbell entry, and
    "sentadilla" fits five - so it goes back unmatched rather than guessed at. ``suggest`` offers
    those candidates for the user to pick from.
    """
    scored = _ranked(query, exercises)
    if not scored:
        return None
    if len(scored) > 1 and scored[0][0] == scored[1][0]:
        return None
    return scored[0][1]


def suggest(query: str, exercises: Iterable[ExerciseOption], limit: int = MAX_SUGGESTIONS) -> list[ExerciseOption]:
    """The closest catalog entries, to offer when the text does not settle on one."""
    return [exercise for _, exercise in _ranked(query, exercises)[:limit]]


def _read_repetitions(line: str) -> tuple[list[int | None], str]:
    """Repetitions per set, and the line with that notation removed."""
    grouped = _SETS_BY_REPS.search(line)
    if grouped:
        count = min(int(grouped.group(1)), MAX_SETS_PER_EXERCISE)
        reps = min(int(grouped.group(2)), MAX_REPS)
        return [reps] * count, _cut(line, grouped)
    listed = _REP_LIST.search(line)
    if listed:
        reps_per_set = [min(int(value), MAX_REPS) for value in re.findall(r"\d{1,3}", listed.group(0))]
        return list(reps_per_set[:MAX_SETS_PER_EXERCISE]), _cut(line, listed)
    # A line naming only an exercise still counts: one set, to fill in by hand.
    return [None], line


def _read_weight(line: str, *, allow_bare_number: bool) -> tuple[float | None, str]:
    """A weight with a unit, or - once the repetitions are gone - a number left on its own."""
    stated = _WEIGHT.search(line)
    if stated:
        return _clamp(_number(stated.group(1) or stated.group(2)), 0, MAX_WEIGHT_KG), _cut(line, stated)
    if allow_bare_number:
        bare = _BARE_NUMBER.search(line)
        if bare:
            return _clamp(_number(bare.group(1)), 0, MAX_WEIGHT_KG), _cut(line, bare)
    return None, line


def _read_line(line: str) -> tuple[str, tuple[ReadSet, ...]]:
    remainder = line
    rpe: float | None = None
    effort = _EFFORT.search(remainder)
    if effort:
        value = _number(effort.group(2))
        rpe = _clamp(10 - value if effort.group(1).lower() == "rir" else value, MIN_RPE, MAX_RPE)
        remainder = _cut(remainder, effort)

    reps_per_set, remainder = _read_repetitions(remainder)
    # Only trust a unitless number as the weight once the repetitions have been accounted for:
    # in "dominadas 3 al fallo" that number is anything but a weight.
    weight, remainder = _read_weight(remainder, allow_bare_number=any(reps_per_set))

    sets = tuple(ReadSet(reps=reps, weight_kg=weight, rpe=rpe) for reps in reps_per_set)
    return " ".join(remainder.split()), sets


class RuleBasedReader:
    """Reads the gym shorthand with regular expressions. No network, no key, no cost."""

    def read(self, text: str, exercises: Sequence[ExerciseOption]) -> list[ReadExercise]:
        result: list[ReadExercise] = []
        for raw_line in _LINE_SEPARATOR.split(text):
            line = raw_line.strip(" .\t,")
            if not line:
                continue
            query, sets = _read_line(line)
            if not _meaningful(query):
                continue
            match = match_exercise(query, exercises)
            result.append(
                ReadExercise(
                    query=query,
                    name=match.name if match else query,
                    exercise_id=match.id if match else None,
                    sets=sets,
                    suggestions=() if match else tuple(suggest(query, exercises)),
                )
            )
        return result


def get_reader() -> WorkoutReader:
    """The reader the API uses. A model-backed one slots in here once a key is configured."""
    return RuleBasedReader()
