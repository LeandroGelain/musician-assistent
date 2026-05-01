from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class MetronomoSettings(Base):
    __tablename__ = 'metronomo_settings'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    bpm: Mapped[int] = mapped_column(Integer, default=90)
    beats_per_bar: Mapped[int] = mapped_column(Integer, default=4)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), unique=True)

    owner = relationship('User', back_populates='metronomo_settings')
