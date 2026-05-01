from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class AfinadorSettings(Base):
    __tablename__ = 'afinador_settings'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    reference_frequency: Mapped[float] = mapped_column(Float, default=440.0)
    instrument: Mapped[str] = mapped_column(String(80), default='Violao')
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), unique=True)

    owner = relationship('User', back_populates='afinador_settings')
