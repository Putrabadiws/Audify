from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.job import JobStatus, SummaryStatus


class SegmentResponse(BaseModel):
    id: int
    idx: int
    start: float
    end: float
    text: str

    model_config = ConfigDict(from_attributes=True)


class TagResponse(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class TagWithCountResponse(TagResponse):
    job_count: int


class JobResponse(BaseModel):
    id: str
    title: str
    original_filename: str
    status: JobStatus
    progress: float
    error: str | None
    language: str | None
    detected_language: str | None
    vocabulary: str
    model: str | None
    duration: float | None
    created_at: datetime
    updated_at: datetime
    tags: list[TagResponse]

    model_config = ConfigDict(from_attributes=True)


class SearchMatch(BaseModel):
    segment_id: int
    start: float
    text: str


class JobSearchResponse(JobResponse):
    # transcript hits for the current ?q=; empty when the job matched by title only
    matches: list[SearchMatch] = []


class JobDetailResponse(JobResponse):
    segments: list[SegmentResponse]
    # original upload has picture frames → editor shows it via GET /jobs/{id}/video
    has_video: bool = False


class JobUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)


class JobTagsUpdate(BaseModel):
    tags: list[str] = Field(..., max_length=20)


class SegmentUpdate(BaseModel):
    text: str = Field(..., max_length=10_000)


class TranscribeRequest(BaseModel):
    # Omitted fields keep the job's current value; language "auto" = auto-detect.
    language: str | None = Field(None, max_length=16)
    vocabulary: str | None = Field(None, max_length=2_000)


class ExportFormat(str, Enum):
    TXT = "txt"
    SRT = "srt"
    VTT = "vtt"
    MD = "md"
    JSON = "json"


class SummaryResponse(BaseModel):
    # "none" = never generated; otherwise mirrors SummaryStatus
    status: SummaryStatus | Literal["none"]
    progress: float = 0.0
    content: str = ""
    error: str | None = None
    model: str | None = None
    edited: bool = False
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SummaryUpdate(BaseModel):
    content: str = Field(..., max_length=50_000)


class AIStatusResponse(BaseModel):
    reachable: bool
    model: str
    model_installed: bool
    installed_models: list[str]
    error: str | None
