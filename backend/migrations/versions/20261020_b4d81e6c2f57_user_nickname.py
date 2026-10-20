"""user nickname

The public name in the ranking, unique regardless of case and null until the user picks one, and
whether the user appears in the ranking at all (yes by default).

Revision ID: b4d81e6c2f57
Revises: a0ccfec2a389
Create Date: 2026-10-20 18:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4d81e6c2f57"
down_revision: str | Sequence[str] | None = "a0ccfec2a389"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("nickname", sa.String(length=20), nullable=True))
    op.add_column("users", sa.Column("show_in_ranking", sa.Boolean(), server_default=sa.text("true"), nullable=False))
    op.create_index("uq_users_nickname_lower", "users", [sa.text("lower(nickname)")], unique=True)


def downgrade() -> None:
    op.drop_index("uq_users_nickname_lower", table_name="users")
    op.drop_column("users", "show_in_ranking")
    op.drop_column("users", "nickname")
