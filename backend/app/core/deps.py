from collections.abc import Iterator

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.repositories.job_repository import JobRepository
from app.repositories.settings_repository import SettingsRepository
from app.repositories.tag_repository import TagRepository
from app.services.job_service import JobService
from app.services.llm import OllamaClient
from app.services.worker import TranscriptionWorker


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_session(request: Request) -> Iterator[Session]:
    session = request.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()


def get_worker(request: Request) -> TranscriptionWorker:
    return request.app.state.worker


def get_job_service(
    session: Session = Depends(get_session),
    worker: TranscriptionWorker = Depends(get_worker),
    settings: Settings = Depends(get_app_settings),
) -> JobService:
    return JobService(JobRepository(session), TagRepository(session), worker, settings.media_dir)


def get_settings_repository(session: Session = Depends(get_session)) -> SettingsRepository:
    return SettingsRepository(session)


def get_llm_status_client(request: Request) -> OllamaClient:
    return request.app.state.llm_status_client
