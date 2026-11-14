"""week plan

The usual week of each user (which weekdays train, and with which routine) and the changes made
for single dates: another routine, a free workout or rest.

Revision ID: a7c2e4f6b8d1
Revises: f2b4c6d8e0a1
Create Date: 2026-11-14 18:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7c2e4f6b8d1"
down_revision: str | Sequence[str] | None = "f2b4c6d8e0a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "planned_days",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("weekday", sa.SmallInteger(), nullable=False),
        sa.Column("routine_id", sa.Integer(), nullable=True),
        sa.CheckConstraint("weekday BETWEEN 0 AND 6", name=op.f("ck_planned_days_weekday_range")),
        sa.ForeignKeyConstraint(
            ["routine_id"], ["routines.id"], name=op.f("fk_planned_days_routine_id_routines"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_planned_days_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_planned_days")),
        sa.UniqueConstraint("user_id", "weekday", name=op.f("uq_planned_days_user_id_weekday")),
    )
    op.create_index(op.f("ix_planned_days_routine_id"), "planned_days", ["routine_id"], unique=False)
    op.create_table(
        "plan_changes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("on_date", sa.Date(), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("routine_id", sa.Integer(), nullable=True),
        sa.CheckConstraint(
            "(kind = 'routine') = (routine_id IS NOT NULL)", name=op.f("ck_plan_changes_routine_matches_kind")
        ),
        sa.ForeignKeyConstraint(
            ["routine_id"], ["routines.id"], name=op.f("fk_plan_changes_routine_id_routines"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_plan_changes_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_plan_changes")),
        sa.UniqueConstraint("user_id", "on_date", name=op.f("uq_plan_changes_user_id_on_date")),
    )
    op.create_index(op.f("ix_plan_changes_routine_id"), "plan_changes", ["routine_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_plan_changes_routine_id"), table_name="plan_changes")
    op.drop_table("plan_changes")
    op.drop_index(op.f("ix_planned_days_routine_id"), table_name="planned_days")
    op.drop_table("planned_days")
