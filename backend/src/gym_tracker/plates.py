"""The bar and plates of the user's gym, for the plate calculator of the workout screen.

Both are stored as null until the user changes them, and read as these defaults meanwhile: an
Olympic bar and the usual set of plates.
"""

from __future__ import annotations

DEFAULT_BAR_KG = 20.0
MIN_BAR_KG = 5.0
MAX_BAR_KG = 25.0

# Every plate the app knows about, heaviest first; a gym has some of them.
PLATE_SIZES_KG: tuple[float, ...] = (25.0, 20.0, 15.0, 10.0, 5.0, 2.5, 2.0, 1.25, 1.0, 0.5)
DEFAULT_PLATES_KG: tuple[float, ...] = (25.0, 20.0, 15.0, 10.0, 5.0, 2.5, 1.25)


def normalize_plates(plates: list[float]) -> list[float]:
    """Known plate sizes, each once, heaviest first; anything else is a ``ValueError``."""
    unknown = sorted({plate for plate in plates if plate not in PLATE_SIZES_KG})
    if unknown:
        raise ValueError(f"Unknown plate sizes: {', '.join(f'{plate:g}' for plate in unknown)}")
    if not plates:
        raise ValueError("At least one plate size is needed")
    return sorted(set(plates), reverse=True)
