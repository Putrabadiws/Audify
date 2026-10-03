from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.job import Tag, job_tags


class TagRepository:
    def __init__(self, session: Session):
        self.session = session

    def find_all_with_counts(self) -> list[tuple[Tag, int]]:
        query = (
            select(Tag, func.count(job_tags.c.job_id))
            .outerjoin(job_tags, job_tags.c.tag_id == Tag.id)
            .group_by(Tag.id)
            .order_by(func.lower(Tag.name))
        )
        return [(tag, count) for tag, count in self.session.execute(query).all()]

    def find_by_names_ci(self, names: list[str]) -> dict[str, Tag]:
        """Existing tags keyed by lower-cased name."""
        if not names:
            return {}
        lowered = [n.lower() for n in names]
        query = select(Tag).where(func.lower(Tag.name).in_(lowered))
        return {t.name.lower(): t for t in self.session.scalars(query).all()}

    def delete_orphans(self) -> None:
        # A tag with no jobs would linger as an empty filter chip forever.
        used = select(job_tags.c.tag_id)
        for tag in self.session.scalars(select(Tag).where(Tag.id.not_in(used))).all():
            self.session.delete(tag)
