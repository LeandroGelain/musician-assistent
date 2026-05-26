from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Partitura(Base):
    __tablename__ = 'partituras'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    source_pdf_path: Mapped[str] = mapped_column(String(512), nullable=False)
    parse_status: Mapped[str] = mapped_column(String(20), default='processing')
    parse_error: Mapped[str] = mapped_column(Text, default='')
    tempo_bpm: Mapped[int] = mapped_column(Integer, default=120)
    time_signature: Mapped[str] = mapped_column(String(10), default='4/4')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))

    owner = relationship('User', back_populates='partituras')
    events = relationship(
        'PartituraEvent',
        back_populates='partitura',
        cascade='all, delete-orphan',
        order_by='PartituraEvent.order_index',
    )
    measure_marks = relationship(
        'PartituraMeasureMark',
        back_populates='partitura',
        cascade='all, delete-orphan',
        order_by='PartituraMeasureMark.measure_number',
    )


class PartituraEvent(Base):
    __tablename__ = 'partitura_events'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(20), default='note')
    note_name: Mapped[str] = mapped_column(String(10), default='')
    octave: Mapped[int] = mapped_column(Integer, default=4)
    frequency_hz: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_label: Mapped[str] = mapped_column(String(20), nullable=False)
    duration_beats: Mapped[float] = mapped_column(Float, nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    measure_number: Mapped[int] = mapped_column(Integer, nullable=False)
    beat_start: Mapped[float] = mapped_column(Float, nullable=False)
    voice: Mapped[int] = mapped_column(Integer, default=1)
    chord_group: Mapped[int] = mapped_column(Integer, default=0)

    partitura_id: Mapped[int] = mapped_column(ForeignKey('partituras.id', ondelete='CASCADE'))

    partitura = relationship('Partitura', back_populates='events')


class PartituraMeasureMark(Base):
    __tablename__ = 'partitura_measure_marks'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    measure_number: Mapped[int] = mapped_column(Integer, nullable=False)
    clef_sign: Mapped[str] = mapped_column(String(2), default='G')
    clef_line: Mapped[int] = mapped_column(Integer, default=2)
    time_signature: Mapped[str] = mapped_column(String(10), default='4/4')
    key_fifths: Mapped[int] = mapped_column(Integer, default=0)
    clef_octave_change: Mapped[int] = mapped_column(Integer, default=0)

    partitura_id: Mapped[int] = mapped_column(ForeignKey('partituras.id', ondelete='CASCADE'))

    partitura = relationship('Partitura', back_populates='measure_marks')
