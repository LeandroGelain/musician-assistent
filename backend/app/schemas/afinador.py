from pydantic import BaseModel, ConfigDict, Field


class AfinadorInput(BaseModel):
    reference_frequency: float = Field(ge=400.0, le=470.0)
    instrument: str = Field(min_length=2, max_length=80)


class AfinadorOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    reference_frequency: float
    instrument: str
