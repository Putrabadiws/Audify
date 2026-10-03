import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Column, DateTime, Enum, Float, ForeignKey, Integer, String, Table, Text
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from app.core.database import Base


def _now() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator[datetime]):
    """Store UTC, always return tz-aware UTC.

    SQLite has no timezone type and hands back naive datetimes; serialized without an offset,
    browsers parse them as local time. Fixing it here (not in the response schema) keeps every
    reader — API, worker, future jobs — consistent.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is not None and value.tzinfo is not None:
            value = value.astimezone(UTC).replace(tzinfo=None)
        return value

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        return value.replace(tzinfo=UTC) if value is not None else None


class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


job_tags = Table(
    "job_tags",
    Base.metadata,
    Column("job_id", ForeignKey("jobs.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # stored as typed; uniqueness is case-insensitive (enforced in JobService) so "Meeting"
    # and "meeting" don't become two filters that look identical in the sidebar
    name: Mapped[str] = mapped_column(String(50), unique=True)

    jobs: Mapped[list["Job"]] = relationship(secondary=job_tags, back_populates="tags")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(255))
    original_filename: Mapped[str] = mapped_column(String(255))
    media_ext: Mapped[str] = mapped_column(String(16))
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.QUEUED)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Requested language (None = auto-detect); detected_language is what the model decided.
    language: Mapped[str | None] = mapped_column(String(16), nullable=True)
    detected_language: Mapped[str | None] = mapped_column(String(16), nullable=True)
    vocabulary: Mapped[str] = mapped_column(Text, default="")
    model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now, onupdate=_now)

    segments: Mapped[list["Segment"]] = relationship(
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="Segment.idx",
    )
    summary: Mapped["Summary | None"] = relationship(
        back_populates="job", cascade="all, delete-orphan", uselist=False
    )
    # selectin: every job response includes its tags; avoids one query per row in lists
    tags: Mapped[list[Tag]] = relationship(
        secondary=job_tags, back_populates="jobs", lazy="selectin", order_by="Tag.name"
    )


class SummaryStatus(str, enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class Summary(Base):
    """AI meeting minutes, one per job. Separate table so adding it needed no schema migration."""

    __tablename__ = "summaries"

    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), primary_key=True)
    status: Mapped[SummaryStatus] = mapped_column(Enum(SummaryStatus), default=SummaryStatus.QUEUED)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    content: Mapped[str] = mapped_column(Text, default="")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # set when the user edits the text by hand, so "Regenerate" can warn before overwriting
    edited: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now, onupdate=_now)

    job: Mapped["Job"] = relationship(back_populates="summary")


class Segment(Base):
    __tablename__ = "segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    idx: Mapped[int] = mapped_column(Integer)
    start: Mapped[float] = mapped_column(Float)
    end: Mapped[float] = mapped_column(Float)
    text: Mapped[str] = mapped_column(Text)
    # [{"start", "end", "word", "probability"}] — kept for future word-level highlight/reflow
    words: Mapped[list[dict]] = mapped_column(JSON, default=list)

    job: Mapped[Job] = relationship(back_populates="segments")


class AppSetting(Base):
    """Key/value store for global user settings (e.g. vocabulary)."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
