from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.afinador_settings import AfinadorSettings
from app.schemas.afinador import AfinadorInput


def get_or_create_settings(db: Session, user_id: int) -> AfinadorSettings:
    query = select(AfinadorSettings).where(AfinadorSettings.user_id == user_id)
    settings = db.scalar(query)

    if settings:
        return settings

    settings = AfinadorSettings(user_id=user_id, reference_frequency=440.0, instrument='Violao')
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def update_settings(
    db: Session,
    user_id: int,
    payload: AfinadorInput,
) -> AfinadorSettings:
    settings = get_or_create_settings(db, user_id)
    settings.reference_frequency = payload.reference_frequency
    settings.instrument = payload.instrument
    db.commit()
    db.refresh(settings)
    return settings
