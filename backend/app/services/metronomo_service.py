from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.metronomo_settings import MetronomoSettings
from app.schemas.metronomo import MetronomoInput


def get_or_create_settings(db: Session, user_id: int) -> MetronomoSettings:
    query = select(MetronomoSettings).where(MetronomoSettings.user_id == user_id)
    settings = db.scalar(query)

    if settings:
        return settings

    settings = MetronomoSettings(user_id=user_id, bpm=90, beats_per_bar=4)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def update_settings(
    db: Session,
    user_id: int,
    payload: MetronomoInput,
) -> MetronomoSettings:
    settings = get_or_create_settings(db, user_id)
    settings.bpm = payload.bpm
    settings.beats_per_bar = payload.beats_per_bar
    db.commit()
    db.refresh(settings)
    return settings
