from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="AUDIFY_", case_sensitive=False)

    app_name: str = "Audify"
    data_dir: Path = BACKEND_DIR / "data"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Spike result (spike/README.md): large-v3-turbo + int8 on CPU = best accuracy for ID+EN
    # code-switching. mlx-whisper was 2x faster but translated English into Indonesian.
    whisper_model: str = "large-v3-turbo"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    default_language: str = "id"

    # Local LLM via Ollama (free, on-device). Spike (spike/README.md): qwen3.5:4b gave usable
    # Indonesian minutes in ~4 min per 10 min of audio on the 8 GB dev Mac.
    ollama_url: str = "http://127.0.0.1:11434"
    llm_model: str = "qwen3.5:4b"
    llm_timeout_s: float = 900.0
    # unload soon after use so Whisper gets the RAM back for the next transcription
    llm_keep_alive: str = "2m"

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.data_dir / 'audify.db'}"

    @property
    def media_dir(self) -> Path:
        return self.data_dir / "media"


@lru_cache
def get_settings() -> Settings:
    return Settings()
