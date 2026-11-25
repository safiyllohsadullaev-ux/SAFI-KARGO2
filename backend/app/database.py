import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import settings


def normalize_database_url(url: str) -> str:
    url = (url or "").strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url.removeprefix("postgres://")
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url.removeprefix("postgresql://")
    if url.startswith("sqlite:///./"):
        from app.config import BASE_DIR

        relative = url.removeprefix("sqlite:///./")
        return "sqlite:///" + (BASE_DIR / relative).as_posix()
    return url


def resolve_database_url() -> str:
    for key in ("DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL"):
        value = os.environ.get(key, "").strip()
        if value.startswith(("postgres://", "postgresql://", "postgresql+")):
            return normalize_database_url(value)
    return normalize_database_url(settings.database_url)


DATABASE_URL = resolve_database_url()
_pooled = "-pooler." in DATABASE_URL or "pgbouncer=true" in DATABASE_URL.lower()

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False}, pool_pre_ping=True)
elif _pooled:
    engine = create_engine(
        DATABASE_URL,
        poolclass=NullPool,
        pool_pre_ping=True,
        connect_args={"prepare_threshold": None},
    )
else:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=5)


@event.listens_for(engine, "connect")
def _enable_fk(dbapi_connection, _connection_record):
    if DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
