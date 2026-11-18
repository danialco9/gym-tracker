import pytest

from gym_tracker.plates import normalize_plates


def test_plates_are_kept_once_each_and_heaviest_first() -> None:
    assert normalize_plates([5, 25, 1.25, 5, 10]) == [25, 10, 5, 1.25]


@pytest.mark.parametrize(
    ("plates", "message"),
    [([25, 7.5], "Unknown plate sizes: 7.5"), ([3], "Unknown plate sizes: 3"), ([], "At least one plate")],
)
def test_unknown_sizes_or_none_at_all_are_refused(plates: list[float], message: str) -> None:
    with pytest.raises(ValueError, match=message):
        normalize_plates(plates)
