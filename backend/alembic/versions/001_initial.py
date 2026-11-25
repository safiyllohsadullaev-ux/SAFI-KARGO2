"""Create the current schema. The application also creates tables on startup."""

from alembic import op
import sqlalchemy as sa

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.database import Base, engine
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)


def downgrade() -> None:
    from app.database import Base, engine
    from app import models  # noqa: F401

    Base.metadata.drop_all(bind=engine)
