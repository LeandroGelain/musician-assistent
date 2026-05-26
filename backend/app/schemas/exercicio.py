from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ExercicioGenerateInput(BaseModel):
    scale: str = Field(default='C', pattern=r'^[A-G][#b]?$')
    tempo_bpm: int = Field(default=80, ge=40, le=200)
    num_measures: int = Field(default=4, ge=1, le=16)
    time_signature: str = Field(default='4/4', pattern=r'^\d+/\d+$')


class ExercicioOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    scale: str
    tempo_bpm: int
    time_signature: str
    num_measures: int
    created_at: datetime
