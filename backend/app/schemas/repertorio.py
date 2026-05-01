from pydantic import BaseModel, ConfigDict, Field


class RepertorioInput(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    artist: str = Field(min_length=1, max_length=150)
    notes: str = Field(default='', max_length=2000)


class RepertorioOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    artist: str
    notes: str
