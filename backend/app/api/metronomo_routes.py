from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.user import User
from app.schemas.metronomo import MetronomoInput, MetronomoOutput
from app.services.metronomo_service import get_or_create_settings, update_settings

router = APIRouter(prefix='/api/metronomo', tags=['metronomo'])


@router.get('/settings', response_model=MetronomoOutput)
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_or_create_settings(db, current_user.id)


@router.put('/settings', response_model=MetronomoOutput)
def put_settings(
    payload: MetronomoInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return update_settings(db, current_user.id, payload)
