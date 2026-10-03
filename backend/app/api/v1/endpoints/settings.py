from fastapi import APIRouter, Depends

from app.core.config import Settings
from app.core.deps import get_app_settings, get_settings_repository
from app.repositories.settings_repository import SettingsRepository
from app.schemas.settings import AppSettingsResponse, AppSettingsUpdate
from app.services.worker import VOCABULARY_KEY

router = APIRouter(prefix="/settings", tags=["settings"])


def _response(repo: SettingsRepository, settings: Settings) -> AppSettingsResponse:
    return AppSettingsResponse(
        vocabulary=repo.get(VOCABULARY_KEY),
        default_language=settings.default_language,
        whisper_model=settings.whisper_model,
    )


@router.get("", response_model=AppSettingsResponse)
def get_settings(
    repo: SettingsRepository = Depends(get_settings_repository),
    settings: Settings = Depends(get_app_settings),
) -> AppSettingsResponse:
    """Get global settings."""
    return _response(repo, settings)


@router.put("", response_model=AppSettingsResponse)
def update_settings(
    data: AppSettingsUpdate,
    repo: SettingsRepository = Depends(get_settings_repository),
    settings: Settings = Depends(get_app_settings),
) -> AppSettingsResponse:
    """Update the global vocabulary applied to every transcription."""
    repo.set(VOCABULARY_KEY, data.vocabulary.strip())
    return _response(repo, settings)
