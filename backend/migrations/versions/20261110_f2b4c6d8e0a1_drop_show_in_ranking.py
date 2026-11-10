"""drop show in ranking

The ranking compares each user with gym-goers at large and lists nobody, so there is nothing to
opt out of.

Revision ID: f2b4c6d8e0a1
Revises: e8f1a3c5d7b9
Create Date: 2026-11-10 20:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2b4c6d8e0a1"
down_revision: str | Sequence[str] | None = "e8f1a3c5d7b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("users", "show_in_ranking")


def downgrade() -> None:
    op.add_column("users", sa.Column("show_in_ranking", sa.Boolean(), server_default=sa.text("true"), nullable=False))
