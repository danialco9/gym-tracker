"""user training goal

What the user trains for (lose fat, build muscle or recomposition), which tunes the reps, effort,
rest and weekly sets the app recommends. Null until they pick one.

Revision ID: a0ccfec2a389
Revises: 007303f4a626
Create Date: 2026-10-20 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a0ccfec2a389"
down_revision: str | Sequence[str] | None = "007303f4a626"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("goal", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "goal")
