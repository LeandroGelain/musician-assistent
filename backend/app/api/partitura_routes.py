import mimetypes

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.user import User
from app.schemas.partitura import PartituraDetailOutput, PartituraSummaryOutput
from app.services.partitura_service import (
    delete_partitura,
    export_partitura_json,
    get_partitura,
    get_partitura_source_path,
    import_partitura_pdf,
    list_partituras,
)

router = APIRouter(prefix='/api/partituras', tags=['partituras'])


@router.get('', response_model=list[PartituraSummaryOutput])
def list_partituras_route(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_partituras(db, current_user.id)


@router.post('/import', response_model=PartituraSummaryOutput, status_code=status.HTTP_201_CREATED)
def import_partitura_route(
    title: str = Form(...),
    tempo_bpm: int = Form(120),
    time_signature: str = Form(''),
    pdf_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filename_lower = pdf_file.filename.lower()
    if not any(filename_lower.endswith(ext) for ext in ('.pdf', '.xml', '.mxl')):
        raise HTTPException(status_code=400, detail='Formato não suportado. Use .xml (MusicXML), .mxl ou .pdf')

    partitura = import_partitura_pdf(
        db=db,
        user_id=current_user.id,
        title=title,
        tempo_bpm=tempo_bpm,
        time_signature=time_signature,
        upload_filename=pdf_file.filename,
        source_stream=pdf_file.file,
    )
    return partitura


@router.get('/{partitura_id}', response_model=PartituraDetailOutput)
def get_partitura_route(
    partitura_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    partitura = get_partitura(db, current_user.id, partitura_id)
    if not partitura:
        raise HTTPException(status_code=404, detail='Partitura nao encontrada')
    return partitura


@router.get('/{partitura_id}/export')
def export_partitura_route(
    partitura_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    partitura = get_partitura(db, current_user.id, partitura_id)
    if not partitura:
        raise HTTPException(status_code=404, detail='Partitura nao encontrada')

    payload = export_partitura_json(partitura)
    filename = f'partitura_{partitura.id}.json'
    return Response(
        content=payload,
        media_type='application/json',
        headers={'Content-Disposition': f'attachment; filename={filename}'},
    )


@router.get('/{partitura_id}/source')
def get_partitura_source_route(
    partitura_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    partitura = get_partitura(db, current_user.id, partitura_id)
    if not partitura:
        raise HTTPException(status_code=404, detail='Partitura nao encontrada')

    source_path = get_partitura_source_path(db, current_user.id, partitura_id)
    if not source_path or not source_path.exists():
        raise HTTPException(status_code=404, detail='Arquivo fonte da partitura nao encontrado')

    guessed_type, _ = mimetypes.guess_type(partitura.source_filename)
    return FileResponse(
        path=source_path,
        media_type=guessed_type or 'application/octet-stream',
        filename=partitura.source_filename,
    )


@router.delete('/{partitura_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_partitura_route(
    partitura_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = delete_partitura(db, current_user.id, partitura_id)
    if not deleted:
        raise HTTPException(status_code=404, detail='Partitura nao encontrada')
    return None
