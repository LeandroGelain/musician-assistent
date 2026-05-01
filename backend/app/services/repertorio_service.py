from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.repertorio_item import RepertorioItem
from app.schemas.repertorio import RepertorioInput


def list_items(db: Session, user_id: int) -> list[RepertorioItem]:
    query = select(RepertorioItem).where(RepertorioItem.user_id == user_id)
    return list(db.scalars(query).all())


def create_item(db: Session, user_id: int, payload: RepertorioInput) -> RepertorioItem:
    item = RepertorioItem(
        title=payload.title,
        artist=payload.artist,
        notes=payload.notes,
        user_id=user_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, user_id: int, item_id: int) -> bool:
    query = select(RepertorioItem).where(
        RepertorioItem.id == item_id,
        RepertorioItem.user_id == user_id,
    )
    item = db.scalar(query)
    if not item:
        return False

    db.delete(item)
    db.commit()
    return True
