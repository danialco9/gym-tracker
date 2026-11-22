"""Where a lift is heading: the trend of its estimated 1RM, carried a month ahead.

One person's sessions are few and noisy (a bad night's sleep, a new rep range), so the trend is a
Huber regression: it fits like least squares near the line and gives far-off sessions only a
linear pull, so one bad day does not bend it. The fit covers the last eight weeks, recent enough to
be the current phase of training and long enough to hold a few sessions. Below four sessions, or two
weeks, or when the exercise was last done a month ago, there is no forecast: a guess would be
dressed up as a number.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum

import numpy as np

WINDOW_DAYS = 56
MIN_SESSIONS = 4
MIN_SPAN_DAYS = 14
STALE_AFTER_DAYS = 28
HORIZON_DAYS = 30
# Weekly change, as a share of the current estimate, that tells a rising or falling lift from a flat one.
FLAT_WEEKLY_SHARE = 0.005
# How wide the range is: the typical distance of a session from the trend, times this.
SPREAD_FACTOR = 1.5
MIN_SPREAD_SHARE = 0.01


class Trend(StrEnum):
    RISING = "rising"
    FLAT = "flat"
    FALLING = "falling"


@dataclass(frozen=True)
class SessionPoint:
    performed_on: date
    e1rm_kg: float


@dataclass(frozen=True)
class Forecast:
    trend: Trend
    # Change per week, as a share of the current estimate (0.01 is 1% a week).
    weekly_change: float
    # The trend at the latest session, where the forecast line starts.
    from_date: date
    from_kg: float
    # The expected estimate a month from today, and the range it likely falls in.
    on: date
    expected_kg: float
    low_kg: float
    high_kg: float


def forecast_e1rm(points: Sequence[SessionPoint], today: date) -> Forecast | None:
    """The trend of the latest eight weeks carried to a month from today, or None if too little data."""
    if not points:
        return None
    latest = max(point.performed_on for point in points)
    if (today - latest).days > STALE_AFTER_DAYS:
        return None
    window = [point for point in points if (latest - point.performed_on).days <= WINDOW_DAYS]
    first = min(point.performed_on for point in window)
    if len(window) < MIN_SESSIONS or (latest - first).days < MIN_SPAN_DAYS:
        return None

    # Imported here: scikit-learn and SciPy take a while to load, and only this needs them.
    from sklearn.linear_model import HuberRegressor  # noqa: PLC0415

    days = np.array([(point.performed_on - first).days for point in window], dtype=float).reshape(-1, 1)
    kgs = np.array([point.e1rm_kg for point in window], dtype=float)
    model = HuberRegressor(alpha=0.0).fit(days, kgs)
    slope = float(model.coef_[0])

    def at(day: date) -> float:
        return float(model.intercept_) + slope * (day - first).days

    from_kg = at(latest)
    target = today + timedelta(days=HORIZON_DAYS)
    expected = max(at(target), 0.0)
    # Median distance from the trend: like the fit, not thrown by one odd session.
    spread = max(
        SPREAD_FACTOR * float(np.median(np.abs(kgs - model.predict(days)))),
        MIN_SPREAD_SHARE * expected,
    )
    weekly_change = slope * 7 / from_kg if from_kg > 0 else 0.0
    if weekly_change >= FLAT_WEEKLY_SHARE:
        trend = Trend.RISING
    elif weekly_change <= -FLAT_WEEKLY_SHARE:
        trend = Trend.FALLING
    else:
        trend = Trend.FLAT
    return Forecast(
        trend=trend,
        weekly_change=round(weekly_change, 4),
        from_date=latest,
        from_kg=round(from_kg, 1),
        on=target,
        expected_kg=round(expected, 1),
        low_kg=round(max(expected - spread, 0.0), 1),
        high_kg=round(expected + spread, 1),
    )
