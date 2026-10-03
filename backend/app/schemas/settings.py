from pydantic import BaseModel, Field


class AppSettingsResponse(BaseModel):
    vocabulary: str
    default_language: str
    whisper_model: str


class AppSettingsUpdate(BaseModel):
    vocabulary: str = Field(..., max_length=2_000)
