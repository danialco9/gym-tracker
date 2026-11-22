import subprocess
import sys
from datetime import date, timedelta

import pytest

from gym_tracker.analysis.forecast import SessionPoint, Trend, forecast_e1rm

TODAY = date(2026, 11, 22)


def sessions(kgs: list[float], *, every_days: int = 4, last: date = TODAY) -> list[SessionPoint]:
    """Sessions ``every_days`` apart, the last one on ``last``."""
    start = last - timedelta(days=every_days * (len(kgs) - 1))
    return [SessionPoint(start + timedelta(days=every_days * index), kg) for index, kg in enumerate(kgs)]


def test_carries_a_rising_lift_a_month_ahead() -> None:
    # 1 kg every 4 days: 7,5 kg in the 30 days ahead.
    forecast = forecast_e1rm(sessions([100, 101, 102, 103, 104, 105]), TODAY)

    assert forecast is not None
    assert forecast.trend is Trend.RISING
    assert forecast.from_date == TODAY
    assert forecast.from_kg == pytest.approx(105, abs=0.1)
    assert forecast.on == TODAY + timedelta(days=30)
    assert forecast.expected_kg == pytest.approx(112.5, abs=0.1)
    # A perfect line still gets a range of 1%: no forecast is exact.
    assert forecast.low_kg < forecast.expected_kg < forecast.high_kg
    assert forecast.high_kg - forecast.expected_kg == pytest.approx(1.1, abs=0.1)
    assert forecast.weekly_change == pytest.approx(1.75 / 105, abs=0.001)


def test_one_bad_day_does_not_bend_the_trend() -> None:
    kgs = [100.0, 101, 102, 103, 80, 105, 106, 107]
    forecast = forecast_e1rm(sessions(kgs), TODAY)

    assert forecast is not None
    assert forecast.trend is Trend.RISING
    # Without the bad day the line ends at 107 and gains 1 kg every 4 days.
    assert forecast.from_kg == pytest.approx(107, abs=0.5)
    assert forecast.expected_kg == pytest.approx(114.5, abs=1)


def test_tells_a_flat_and_a_falling_lift() -> None:
    flat = forecast_e1rm(sessions([100, 100.5, 99.5, 100, 100.5, 100]), TODAY)
    falling = forecast_e1rm(sessions([110, 108, 106, 104, 102, 100]), TODAY)

    assert flat is not None
    assert flat.trend is Trend.FLAT
    assert falling is not None
    assert falling.trend is Trend.FALLING
    assert falling.expected_kg < 100


def test_only_the_last_eight_weeks_count() -> None:
    # A long-gone rise, then two months flat: the forecast follows the flat part.
    old = sessions([60, 70, 80, 90], every_days=7, last=TODAY - timedelta(days=70))
    recent = sessions([100, 100, 100, 100, 100], every_days=10)

    forecast = forecast_e1rm(old + recent, TODAY)

    assert forecast is not None
    assert forecast.trend is Trend.FLAT
    assert forecast.expected_kg == pytest.approx(100, abs=0.1)


@pytest.mark.parametrize(
    "points",
    [
        [],
        sessions([100, 101, 102]),  # three sessions
        sessions([100, 101, 102, 103], every_days=3),  # nine days
        sessions([100, 101, 102, 103, 104], last=TODAY - timedelta(days=29)),  # a month ago
    ],
)
def test_no_forecast_from_too_little_or_old_data(points: list[SessionPoint]) -> None:
    assert forecast_e1rm(points, TODAY) is None


def test_the_api_starts_without_loading_scikit_learn() -> None:
    # Cold starts on Vercel: only a forecast pays for scikit-learn and SciPy.
    code = "import sys, gym_tracker.main; print('sklearn' in sys.modules)"
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)
    assert result.stdout.strip() == "False"
