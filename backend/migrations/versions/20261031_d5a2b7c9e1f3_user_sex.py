"""user sex

Optional and private: it only picks the population a lift is compared with in the ranking, as
average strength differs a lot between men and women. Null compares with everyone.

Revision ID: d5a2b7c9e1f3
Revises: c3e9f0a1b2d4
Create Date: 2026-10-31 19:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d5a2b7c9e1f3"
down_revision: str | Sequence[str] | None = "c3e9f0a1b2d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("sex", sa.String(length=10), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "sex")
