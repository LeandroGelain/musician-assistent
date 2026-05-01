from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.user import User
from app.schemas.repertorio import RepertorioInput, RepertorioOutput
from app.services.repertorio_service import create_item, delete_item, list_items

router = APIRouter(prefix='/api/repertorio', tags=['repertorio'])


@router.get('', response_model=list[RepertorioOutput])
def list_repertorio(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_items(db, current_user.id)


@router.post('', response_model=RepertorioOutput, status_code=status.HTTP_201_CREATED)
def create_repertorio(
    payload: RepertorioInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_item(db, current_user.id, payload)


@router.delete('/{item_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_repertorio(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = delete_item(db, current_user.id, item_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Item nao encontrado',
        )
    return None
