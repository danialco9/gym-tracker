"""user training block

Mesocycles: the length of the user's training blocks in weeks and the Monday the first one began.
The current week, and whether it is the deload, are worked out from them. Null without blocks.

Revision ID: e8f1a3c5d7b9
Revises: d5a2b7c9e1f3
Create Date: 2026-11-09 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e8f1a3c5d7b9"
down_revision: str | Sequence[str] | None = "d5a2b7c9e1f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("block_weeks", sa.SmallInteger(), nullable=True))
    op.add_column("users", sa.Column("block_started_on", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "block_started_on")
    op.drop_column("users", "block_weeks")
