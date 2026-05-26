from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from app.api.deps import get_current_user
from app.db import get_db
from app.models.user import User
from app.schemas.exercicio import ExercicioGenerateInput, ExercicioOutput
from app.services.exercicio_service import (
    delete_exercicio,
    generate_exercise,
    get_exercicio,
    get_exercicio_mxl_path,
    list_exercicios,
)
from sqlalchemy.orm import Session

router = APIRouter(prefix='/api/exercicios', tags=['exercicios'])


@router.post('/generate', response_model=ExercicioOutput, status_code=status.HTTP_201_CREATED)
def generate_exercicio_route(
    payload: ExercicioGenerateInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exercicio = generate_exercise(
        db=db,
        user_id=current_user.id,
        scale=payload.scale,
        tempo_bpm=payload.tempo_bpm,
        num_measures=payload.num_measures,
        time_signature=payload.time_signature,
    )
    return exercicio


@router.get('', response_model=list[ExercicioOutput])
def list_exercicios_route(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_exercicios(db, current_user.id)


@router.get('/{exercicio_id}', response_model=ExercicioOutput)
def get_exercicio_route(
    exercicio_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exercicio = get_exercicio(db, current_user.id, exercicio_id)
    if not exercicio:
        raise HTTPException(status_code=404, detail='Exercicio nao encontrado')
    return exercicio


@router.get('/{exercicio_id}/source')
def get_exercicio_source_route(
    exercicio_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exercicio = get_exercicio(db, current_user.id, exercicio_id)
    if not exercicio:
        raise HTTPException(status_code=404, detail='Exercicio nao encontrado')

    mxl_path = get_exercicio_mxl_path(db, current_user.id, exercicio_id)
    if not mxl_path or not mxl_path.exists():
        raise HTTPException(status_code=404, detail='Arquivo MXL do exercicio nao encontrado')

    return FileResponse(
        path=mxl_path,
        media_type='application/vnd.recordare.musicxml',
        filename=f'exercicio_{exercicio_id}.mxl',
    )


@router.delete('/{exercicio_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_exercicio_route(
    exercicio_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = delete_exercicio(db, current_user.id, exercicio_id)
    if not deleted:
        raise HTTPException(status_code=404, detail='Exercicio nao encontrado')
    return None
