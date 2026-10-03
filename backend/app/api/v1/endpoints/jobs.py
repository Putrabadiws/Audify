from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response

from app.core.config import Settings
from app.core.deps import get_app_settings, get_job_service
from app.models.job import Job
from app.schemas.job import (
    ExportFormat,
    JobDetailResponse,
    JobResponse,
    JobSearchResponse,
    JobTagsUpdate,
    JobUpdate,
    SegmentResponse,
    SegmentUpdate,
    SummaryResponse,
    SummaryUpdate,
    TranscribeRequest,
)
from app.services import media
from app.services.exporters import MEDIA_TYPES, attachment_header
from app.services.job_service import (
    InvalidTagError,
    JobNotReadyError,
    JobService,
    UnsupportedMediaError,
)

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _get_job_or_404(service: JobService, job_id: str, with_segments: bool = False) -> Job:
    job = service.get_job(job_id, with_segments=with_segments)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Job not found: {job_id}"
        )
    return job


@router.get("", response_model=list[JobSearchResponse])
def list_jobs(
    tag: int | None = Query(None, description="Only jobs with this tag id"),
    q: str | None = Query(None, max_length=200, description="Search title and transcript"),
    service: JobService = Depends(get_job_service),
) -> list[JobSearchResponse]:
    """List jobs newest first, optionally filtered by tag and/or text search."""
    jobs = service.list_jobs(tag_id=tag, query=q)
    matches = service.search_matches(jobs, q) if q and q.strip() else {}
    return [
        JobSearchResponse.model_validate(job).model_copy(
            update={"matches": matches.get(job.id, [])}
        )
        for job in jobs
    ]


@router.post("", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
def create_job(
    file: UploadFile = File(...),
    language: str | None = Form(None),
    vocabulary: str = Form("", max_length=2_000),
    service: JobService = Depends(get_job_service),
    settings: Settings = Depends(get_app_settings),
) -> Job:
    """Upload an audio/video file and queue it for transcription."""
    try:
        return service.create_from_upload(
            filename=file.filename or "upload",
            stream=file.file,
            language=language,
            vocabulary=vocabulary,
            default_language=settings.default_language,
        )
    except UnsupportedMediaError as exc:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(exc))


@router.get("/{job_id}", response_model=JobDetailResponse)
def get_job(job_id: str, service: JobService = Depends(get_job_service)) -> JobDetailResponse:
    """Get a job with its transcript segments."""
    job = _get_job_or_404(service, job_id, with_segments=True)
    return JobDetailResponse.model_validate(job).model_copy(
        update={"has_video": service.video_path(job) is not None}
    )


@router.patch("/{job_id}", response_model=JobResponse)
def update_job(job_id: str, data: JobUpdate, service: JobService = Depends(get_job_service)) -> Job:
    """Rename a job."""
    return service.rename(_get_job_or_404(service, job_id), data.title)


@router.put("/{job_id}/tags", response_model=JobResponse)
def set_job_tags(
    job_id: str, data: JobTagsUpdate, service: JobService = Depends(get_job_service)
) -> Job:
    """Replace a job's tags (created on the fly, matched case-insensitively)."""
    try:
        return service.set_tags(_get_job_or_404(service, job_id), data.tags)
    except InvalidTagError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(job_id: str, service: JobService = Depends(get_job_service)) -> Response:
    """Delete a job and its media files."""
    try:
        service.delete(_get_job_or_404(service, job_id))
    except JobNotReadyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{job_id}/transcribe", response_model=JobResponse)
def retranscribe_job(
    job_id: str,
    data: TranscribeRequest,
    service: JobService = Depends(get_job_service),
    settings: Settings = Depends(get_app_settings),
) -> Job:
    """Re-run transcription (e.g. after changing language or vocabulary)."""
    try:
        return service.retranscribe(
            _get_job_or_404(service, job_id), data, settings.default_language
        )
    except JobNotReadyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.patch("/{job_id}/segments/{segment_id}", response_model=SegmentResponse)
def update_segment(
    job_id: str,
    segment_id: int,
    data: SegmentUpdate,
    service: JobService = Depends(get_job_service),
):
    """Edit the text of one segment."""
    segment = service.update_segment_text(job_id, segment_id, data.text)
    if segment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Segment not found: {segment_id}"
        )
    return segment


@router.get("/{job_id}/media")
def get_media(job_id: str, service: JobService = Depends(get_job_service)) -> FileResponse:
    """Stream the playback audio (supports HTTP Range so the player can seek)."""
    path = service.playback_path(_get_job_or_404(service, job_id))
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not ready yet")
    return FileResponse(path, media_type="audio/mp4")


@router.get("/{job_id}/video")
def get_video(job_id: str, service: JobService = Depends(get_job_service)) -> FileResponse:
    """Stream the original upload for the editor's video preview (Range-capable, no re-encode).

    Served as-is rather than transcoded to H.264: transcoding competes with Whisper for the
    same CPU and doubles disk use; the frontend falls back to /media when the codec won't play.
    """
    path = service.video_path(_get_job_or_404(service, job_id))
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This file has no video")
    media_type = media.VIDEO_MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media_type)


@router.get("/{job_id}/export")
def export_job(
    job_id: str,
    format: ExportFormat = Query(ExportFormat.TXT),
    timestamps: bool = Query(True),
    service: JobService = Depends(get_job_service),
) -> Response:
    """Download the transcript as txt / srt / vtt / md / json."""
    job = _get_job_or_404(service, job_id, with_segments=True)
    try:
        content = service.export(job, format, timestamps)
    except JobNotReadyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    filename = f"{job.title}.{format.value}"
    return Response(
        content=content,
        media_type=MEDIA_TYPES[format],
        headers={"Content-Disposition": attachment_header(filename)},
    )


@router.get("/{job_id}/summary", response_model=SummaryResponse)
def get_summary(job_id: str, service: JobService = Depends(get_job_service)) -> SummaryResponse:
    """AI summary of the transcript; status "none" if it was never generated."""
    job = _get_job_or_404(service, job_id)
    if job.summary is None:
        return SummaryResponse(status="none")
    return SummaryResponse.model_validate(job.summary)


@router.post(
    "/{job_id}/summary", response_model=SummaryResponse, status_code=status.HTTP_202_ACCEPTED
)
def generate_summary(
    job_id: str, service: JobService = Depends(get_job_service)
) -> SummaryResponse:
    """Queue AI summary generation (local LLM). Poll GET for progress."""
    job = _get_job_or_404(service, job_id, with_segments=True)
    try:
        return SummaryResponse.model_validate(service.request_summary(job))
    except JobNotReadyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.put("/{job_id}/summary", response_model=SummaryResponse)
def update_summary(
    job_id: str, data: SummaryUpdate, service: JobService = Depends(get_job_service)
) -> SummaryResponse:
    """Save a hand-edited summary."""
    try:
        return SummaryResponse.model_validate(
            service.update_summary(_get_job_or_404(service, job_id), data.content)
        )
    except JobNotReadyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
