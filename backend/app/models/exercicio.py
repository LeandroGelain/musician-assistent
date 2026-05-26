from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Exercicio(Base):
    __tablename__ = 'exercicios'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    scale: Mapped[str] = mapped_column(String(20), default='C')
    generated_mxl_path: Mapped[str] = mapped_column(String(512), nullable=False)
    tempo_bpm: Mapped[int] = mapped_column(Integer, default=80)
    time_signature: Mapped[str] = mapped_column(String(10), default='4/4')
    num_measures: Mapped[int] = mapped_column(Integer, default=4)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))

    owner = relationship('User', back_populates='exercicios')
