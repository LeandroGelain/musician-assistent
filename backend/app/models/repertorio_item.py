from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class RepertorioItem(Base):
    __tablename__ = 'repertorio_items'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    artist: Mapped[str] = mapped_column(String(150), nullable=False)
    notes: Mapped[str] = mapped_column(Text, default='')
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))

    owner = relationship('User', back_populates='repertorio_items')
