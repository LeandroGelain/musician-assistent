from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PartituraEventOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_index: int
    event_type: str
    note_name: str
    octave: int
    frequency_hz: float | None
    duration_label: str
    duration_beats: float
    duration_ms: int
    measure_number: int
    beat_start: float
    voice: int
    chord_group: int


class PartituraMeasureMarkOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    measure_number: int
    clef_sign: str
    clef_line: int
    time_signature: str
    key_fifths: int
    clef_octave_change: int


class PartituraSummaryOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    source_filename: str
    parse_status: str
    parse_error: str
    tempo_bpm: int
    time_signature: str
    created_at: datetime


class PartituraDetailOutput(PartituraSummaryOutput):
    events: list[PartituraEventOutput]
    measure_marks: list[PartituraMeasureMarkOutput] = []


class PartituraExportOutput(BaseModel):
    id: int
    title: str
    source_filename: str
    tempo_bpm: int
    time_signature: str
    total_measures: int
    measure_marks: list[PartituraMeasureMarkOutput]
    events: list[PartituraEventOutput]


class PartituraImportOptions(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    tempo_bpm: int = Field(default=120, ge=30, le=260)
    time_signature: str = Field(default='', pattern=r'^$|^\d+/\d+$')
