"""empty message

Revision ID: 1a41b6782358
Revises: 43e07fc8d2af
Create Date: 2026-11-03 16:26:16.756075

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1a41b6782358'
down_revision: Union[str, Sequence[str], None] = '43e07fc8d2af'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
