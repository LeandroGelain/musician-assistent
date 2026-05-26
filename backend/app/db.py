from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.models.base import Base

engine = None
SessionLocal = None


def get_engine():
    global engine
    if engine is None:
        settings = get_settings()
        connect_args = (
            {'check_same_thread': False}
            if settings.database_url.startswith('sqlite')
            else {}
        )
        engine = create_engine(
            settings.database_url,
            connect_args=connect_args,
            pool_pre_ping=True,
        )
    return engine


def get_session_factory():
    global SessionLocal
    if SessionLocal is None:
        SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=get_engine(),
        )
    return SessionLocal


def reset_db_state() -> None:
    global engine, SessionLocal
    if engine is not None:
        engine.dispose()
    engine = None
    SessionLocal = None


def get_db() -> Generator[Session, None, None]:
    db = get_session_factory()()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    db_engine = get_engine()
    Base.metadata.create_all(bind=db_engine)
    _ensure_partitura_measure_marks_columns(db_engine)


def _ensure_partitura_measure_marks_columns(db_engine) -> None:
    inspector = inspect(db_engine)
    if 'partitura_measure_marks' not in inspector.get_table_names():
        return

    existing_columns = {column['name'] for column in inspector.get_columns('partitura_measure_marks')}
    statements: list[str] = []

    if 'key_fifths' not in existing_columns:
        statements.append('ALTER TABLE partitura_measure_marks ADD COLUMN key_fifths INTEGER NOT NULL DEFAULT 0')

    if 'clef_octave_change' not in existing_columns:
        statements.append('ALTER TABLE partitura_measure_marks ADD COLUMN clef_octave_change INTEGER NOT NULL DEFAULT 0')

    if not statements:
        return

    with db_engine.begin() as connection:
        for stmt in statements:
            connection.execute(text(stmt))
