from pydantic import BaseModel, ConfigDict, Field


class MetronomoInput(BaseModel):
    bpm: int = Field(ge=30, le=240)
    beats_per_bar: int = Field(ge=1, le=12)


class MetronomoOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    bpm: int
    beats_per_bar: int
