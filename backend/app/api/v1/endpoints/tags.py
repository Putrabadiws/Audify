from fastapi import APIRouter, Depends

from app.core.deps import get_job_service
from app.schemas.job import TagWithCountResponse
from app.services.job_service import JobService

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagWithCountResponse])
def list_tags(service: JobService = Depends(get_job_service)) -> list[TagWithCountResponse]:
    """All tags with how many jobs use each, alphabetical."""
    return [
        TagWithCountResponse(id=tag.id, name=tag.name, job_count=count)
        for tag, count in service.list_tags()
    ]
