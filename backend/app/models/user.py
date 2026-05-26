from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class User(Base):
    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    repertorio_items = relationship('RepertorioItem', back_populates='owner', cascade='all, delete-orphan')
    metronomo_settings = relationship(
        'MetronomoSettings',
        back_populates='owner',
        uselist=False,
        cascade='all, delete-orphan',
    )
    afinador_settings = relationship(
        'AfinadorSettings',
        back_populates='owner',
        uselist=False,
        cascade='all, delete-orphan',
    )
    partituras = relationship(
        'Partitura',
        back_populates='owner',
        cascade='all, delete-orphan',
    )
    exercicios = relationship(
        'Exercicio',
        back_populates='owner',
        cascade='all, delete-orphan',
    )
