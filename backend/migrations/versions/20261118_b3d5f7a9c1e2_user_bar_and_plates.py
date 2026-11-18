"""user bar and plates

The bar and plates of the user's gym, for the plate calculator of the workout screen. Null until the
user changes them, and read as the defaults meanwhile.

Revision ID: b3d5f7a9c1e2
Revises: a7c2e4f6b8d1
Create Date: 2026-11-18 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b3d5f7a9c1e2"
down_revision: str | Sequence[str] | None = "a7c2e4f6b8d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("bar_kg", sa.Numeric(4, 2), nullable=True))
    op.add_column("users", sa.Column("plates_kg", postgresql.ARRAY(sa.Numeric(5, 2)), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "plates_kg")
    op.drop_column("users", "bar_kg")
