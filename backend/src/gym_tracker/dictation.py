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
        # How people tell it ("hoy hice...", "luego..."), never part of an exercise name.
        "hice",
        "he",
        "hecho",
        "hoy",
        "luego",
        "despues",
        "tambien",
    ]
)

# Numbers written as words ("tres series de diez con sesenta"), read as digits before anything else.
# "uno", "un" and "una" are left out on their own: they are far more often an article ("curl a
# una mano") than a count. "uno" still counts at the end of a number ("cuarenta y uno").
_UNITS = {"dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9}
_TEENS = {
    "diez": 10,
    "once": 11,
    "doce": 12,
    "trece": 13,
    "catorce": 14,
    "quince": 15,
    "dieciseis": 16,
    "diecisiete": 17,
    "dieciocho": 18,
    "diecinueve": 19,
    "veinte": 20,
    "veintiuno": 21,
    "veintidos": 22,
    "veintitres": 23,
    "veinticuatro": 24,
    "veinticinco": 25,
    "veintiseis": 26,
    "veintisiete": 27,
    "veintiocho": 28,
    "veintinueve": 29,
}
_TENS = {"treinta": 30, "cuarenta": 40, "cincuenta": 50, "sesenta": 60, "setenta": 70, "ochenta": 80, "noventa": 90}
_HUNDREDS = {
    "ciento": 100,
    "cien": 100,
    "doscientos": 200,
    "trescientos": 300,
    "cuatrocientos": 400,
    "quinientos": 500,
    "seiscientos": 600,
}
_NUMBER_WORDS = {"cero": 0, "uno": 1, **_UNITS, **_TEENS, **_TENS, **_HUNDREDS}


def _any_of(words: Iterable[str]) -> str:
    """An alternation of the words, longest first, with each vowel matching its accented form too."""
    accented = str.maketrans({"a": "[aá]", "e": "[eé]", "i": "[ií]", "o": "[oó]", "u": "[uúü]"})
    return "(?:" + "|".join(word.translate(accented) for word in sorted(words, key=len, reverse=True)) + ")"


_UNIT_WORD = _any_of(_UNITS)
_LAST_UNIT_WORD = _any_of([*_UNITS, "uno"])
_TENS_WORD = rf"{_any_of(_TENS)}(?:\s+y\s+{_LAST_UNIT_WORD})?"
_SPELLED_NUMBER = re.compile(
    rf"\b(?:{_any_of(_HUNDREDS)}(?:\s+(?:{_TENS_WORD}|{_any_of(_TEENS)}|{_LAST_UNIT_WORD}))?"
    rf"|{_TENS_WORD}|{_any_of(_TEENS)}|{_UNIT_WORD}|cero)\b",
    re.IGNORECASE,
)

# "4x10", "4 x 10", the same with a multiplication sign, or "4 series de 10": the number of sets first.
_SETS_BY_REPS = re.compile(r"(?<!\d)(\d{1,2})(?:\s*[x\u00d7]\s*|\s+series?\s+de\s+)(\d{1,3})(?!\d)", re.IGNORECASE)
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
# Runs of spaces, tabs and line breaks, which ``_tidy`` brings down to one.
_WHITESPACE = re.compile(r"\s+")
# A new line, a semicolon, or " y " before an exercise ("prensa 4x10 y curl 3x12"). Single spaces
# only: on tidied text that is all there is, and it keeps the split linear however long the text.
_LINE_SEPARATOR = re.compile(r"[\n;]+| y (?=\D)")


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


def _tidy(text: str) -> str:
    """One space between words, and one line break where there was any."""
    return _WHITESPACE.sub(lambda run: "\n" if "\n" in run.group(0) else " ", text)


def _digits(text: str) -> str:
    """The text with its spelled-out numbers written as digits: "ciento veinte" becomes "120"."""

    def value(match: re.Match[str]) -> str:
        # The pattern only lets words through in an order that adds up: hundreds, tens, units.
        return str(sum(_NUMBER_WORDS[word] for word in _words(match.group(0)) if word != "y"))

    return _SPELLED_NUMBER.sub(value, text)


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
        # Before splitting, so the "y" in "treinta y cinco" is not read as the start of a new line.
        for raw_line in _LINE_SEPARATOR.split(_digits(_tidy(text))):
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
