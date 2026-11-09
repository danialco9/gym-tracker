import pytest

from gym_tracker.dictation import ExerciseOption, RuleBasedReader, match_exercise

CATALOG = [
    ExerciseOption(id=1, name="Prensa de piernas"),
    ExerciseOption(id=2, name="Press banca con barra"),
    ExerciseOption(id=3, name="Press inclinado con mancuernas"),
    ExerciseOption(id=4, name="Jalón al pecho"),
    ExerciseOption(id=5, name="Dominadas"),
    ExerciseOption(id=6, name="Sentadilla con barra"),
    ExerciseOption(id=7, name="Curl de bíceps con barra"),
]


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("prensa", 1),
        ("PRENSA DE PIERNAS", 1),
        ("jalon al pecho", 4),  # written without the accent
        ("dominadas", 5),
        ("sentadilla", 6),
        ("press banca", 2),
        ("press inclinado mancuernas", 3),
    ],
)
def test_match_exercise_finds_the_catalog_entry(query: str, expected: int) -> None:
    match = match_exercise(query, CATALOG)

    assert match is not None
    assert match.id == expected


@pytest.mark.parametrize("query", ["", "a con de", "remo en polea", "press"])
def test_match_exercise_declines_when_nothing_is_close_enough(query: str) -> None:
    # "press" alone covers too little of any of the three press names to pick one of them.
    assert match_exercise(query, CATALOG) is None


def test_reads_sets_by_reps_and_a_bare_weight() -> None:
    [exercise] = RuleBasedReader().read("prensa 4x10 120", CATALOG)

    assert exercise.exercise_id == 1
    assert exercise.name == "Prensa de piernas"
    assert len(exercise.sets) == 4
    assert all(item.reps == 10 and item.weight_kg == 120 for item in exercise.sets)


def test_reads_a_rep_list_with_weight_and_rpe() -> None:
    [exercise] = RuleBasedReader().read("press banca 12,10,8 a 60 rpe 8", CATALOG)

    assert exercise.exercise_id == 2
    assert [item.reps for item in exercise.sets] == [12, 10, 8]
    assert all(item.weight_kg == 60 and item.rpe == 8 for item in exercise.sets)


@pytest.mark.parametrize(
    ("text", "rpe"),
    [
        ("press banca 3x8 a 60 rir 2", 8.0),
        ("press banca 3x8 a 60 RIR 0", 10.0),
        ("press banca 3x8 a 60 rir 1,5", 8.5),
        # More reps left than the scale holds still reads as the easiest effort, not an error.
        ("press banca 3x8 a 60 rir 12", 1.0),
    ],
)
def test_reads_reps_in_reserve_as_rpe(text: str, rpe: float) -> None:
    [exercise] = RuleBasedReader().read(text, CATALOG)

    assert exercise.exercise_id == 2
    assert [item.reps for item in exercise.sets] == [8, 8, 8]
    assert all(item.weight_kg == 60 and item.rpe == rpe for item in exercise.sets)


@pytest.mark.parametrize(
    ("text", "weight"),
    [
        ("sentadilla 5x5 100kg", 100.0),
        ("sentadilla 5x5 con 82,5", 82.5),
        ("sentadilla 5x5 a 100 kilos", 100.0),
        ("sentadilla 5x5", None),
    ],
)
def test_reads_the_weight_however_it_is_written(text: str, weight: float | None) -> None:
    [exercise] = RuleBasedReader().read(text, CATALOG)

    assert exercise.sets[0].weight_kg == weight


def test_a_number_that_is_not_a_weight_is_left_alone() -> None:
    # Nothing here says how many repetitions, so "3" must not be mistaken for kilos.
    [exercise] = RuleBasedReader().read("dominadas 3 al fallo", CATALOG)

    assert exercise.exercise_id == 5
    assert len(exercise.sets) == 1
    assert exercise.sets[0].weight_kg is None


def test_reads_several_exercises_from_one_dictation() -> None:
    text = "prensa 4x10 120\npress banca 3x8 a 60 y curl de biceps 3x12 20kg"

    read = RuleBasedReader().read(text, CATALOG)

    assert [exercise.exercise_id for exercise in read] == [1, 2, 7]
    assert [len(exercise.sets) for exercise in read] == [4, 3, 3]


def test_an_unknown_exercise_comes_back_for_the_user_to_resolve() -> None:
    [exercise] = RuleBasedReader().read("maquina rara 3x10 40", CATALOG)

    assert exercise.exercise_id is None
    assert exercise.name == "maquina rara"
    assert len(exercise.sets) == 3


def test_absurd_numbers_are_clamped_to_what_the_api_accepts() -> None:
    [exercise] = RuleBasedReader().read("prensa 99x999 a 9999 rpe 99", CATALOG)

    assert len(exercise.sets) == 20
    assert exercise.sets[0].reps == 200
    assert exercise.sets[0].weight_kg == 1000
    assert exercise.sets[0].rpe == 10


def test_empty_and_noise_only_text_reads_as_nothing() -> None:
    assert RuleBasedReader().read("   \n\n  ", CATALOG) == []
    assert RuleBasedReader().read("4x10 120", CATALOG) == []


def test_an_ambiguous_name_comes_back_unmatched() -> None:
    # "sentadilla" fits both of these equally well, so the reader must not pick one at random.
    catalog = [*CATALOG, ExerciseOption(id=8, name="Sentadilla frontal")]

    assert match_exercise("sentadilla", catalog) is None


def test_the_head_noun_breaks_a_tie() -> None:
    # Both names share one of their two words with "prensa"; only one of them is about the press.
    catalog = [*CATALOG, ExerciseOption(id=9, name="Gemelos en prensa")]

    match = match_exercise("prensa", catalog)

    assert match is not None
    assert match.name == "Prensa de piernas"


def test_an_ambiguous_line_offers_the_candidates() -> None:
    catalog = [
        ExerciseOption(id=1, name="Press banca con barra"),
        ExerciseOption(id=2, name="Press banca con mancuernas"),
        ExerciseOption(id=3, name="Curl de bíceps con barra"),
    ]

    [exercise] = RuleBasedReader().read("press banca 3x8 a 60", catalog)

    assert exercise.exercise_id is None
    assert [option.id for option in exercise.suggestions] == [1, 2]


def test_a_confident_match_offers_no_candidates() -> None:
    [exercise] = RuleBasedReader().read("prensa 4x10 120", CATALOG)

    assert exercise.exercise_id == 1
    assert exercise.suggestions == ()
