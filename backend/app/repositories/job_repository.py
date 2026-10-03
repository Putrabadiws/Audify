from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.job import Job, JobStatus, Segment, Tag

LIKE_ESCAPE = "\\"


def like_pattern(term: str) -> str:
    """Substring LIKE pattern with the user's own %, _ and \\ treated literally.

    Without escaping, searching "100%" would also match "1000" and "a_b" would match "axb".
    """
    escaped = (
        term.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
        .replace("%", LIKE_ESCAPE + "%")
        .replace("_", LIKE_ESCAPE + "_")
    )
    return f"%{escaped}%"


class JobRepository:
    def __init__(self, session: Session):
        self.session = session

    def find_all(self, tag_id: int | None = None, text: str | None = None) -> list[Job]:
        """Newest first; optional tag filter and case-insensitive title/transcript search."""
        query = select(Job).order_by(Job.created_at.desc())
        if tag_id is not None:
            query = query.where(Job.tags.any(Tag.id == tag_id))
        if text:
            pattern = like_pattern(text)
            in_transcript = (
                select(Segment.job_id)
                .where(Segment.text.ilike(pattern, escape=LIKE_ESCAPE))
                .scalar_subquery()
            )
            query = query.where(
                or_(Job.title.ilike(pattern, escape=LIKE_ESCAPE), Job.id.in_(in_transcript))
            )
        return list(self.session.scalars(query).all())

    def find_matching_segments(
        self, job_ids: list[str], text: str, per_job: int
    ) -> dict[str, list[Segment]]:
        if not job_ids or not text:
            return {}
        query = (
            select(Segment)
            .where(
                Segment.job_id.in_(job_ids),
                Segment.text.ilike(like_pattern(text), escape=LIKE_ESCAPE),
            )
            .order_by(Segment.job_id, Segment.idx)
        )
        result: dict[str, list[Segment]] = {}
        for seg in self.session.scalars(query).all():
            hits = result.setdefault(seg.job_id, [])
            if len(hits) < per_job:
                hits.append(seg)
        return result

    def find_by_id(self, job_id: str, with_segments: bool = False) -> Job | None:
        query = select(Job).where(Job.id == job_id)
        if with_segments:
            query = query.options(selectinload(Job.segments))
        return self.session.scalar(query)

    def find_by_status(self, *statuses: JobStatus) -> list[Job]:
        query = select(Job).where(Job.status.in_(statuses)).order_by(Job.created_at)
        return list(self.session.scalars(query).all())

    def find_segment(self, job_id: str, segment_id: int) -> Segment | None:
        query = select(Segment).where(Segment.job_id == job_id, Segment.id == segment_id)
        return self.session.scalar(query)

    def add(self, job: Job) -> Job:
        self.session.add(job)
        self.session.commit()
        self.session.refresh(job)
        return job

    def replace_segments(self, job: Job, segments: list[Segment]) -> None:
        job.segments.clear()
        # flush the deletes before inserting so idx order never collides
        self.session.flush()
        job.segments.extend(segments)

    def delete(self, job: Job) -> None:
        self.session.delete(job)
        self.session.commit()

    def commit(self) -> None:
        self.session.commit()
