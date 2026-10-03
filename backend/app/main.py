from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import Settings, get_settings
from app.core.database import Base, create_db_engine, create_session_factory
from app.core.logging import RequestIdMiddleware, configure_logging
from app.services.llm import LLMClient, OllamaClient
from app.services.summarizer import Summarizer
from app.services.transcriber import FasterWhisperTranscriber, Transcriber
from app.services.worker import TranscriptionWorker


def create_app(
    settings: Settings | None = None,
    transcriber: Transcriber | None = None,
    llm_client: LLMClient | None = None,
) -> FastAPI:
    """App factory; tests inject temp settings, a fake transcriber and a fake LLM."""
    settings = settings or get_settings()
    ollama = OllamaClient(
        settings.ollama_url, settings.llm_model, settings.llm_timeout_s, settings.llm_keep_alive
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        settings.media_dir.mkdir(parents=True, exist_ok=True)
        engine = create_db_engine(settings.database_url)
        # create_all instead of Alembic: single-user local MVP, schema still moving.
        # Add Alembic before the first deploy that must keep existing data.
        Base.metadata.create_all(engine)
        session_factory = create_session_factory(engine)
        worker = TranscriptionWorker(
            session_factory,
            transcriber
            or FasterWhisperTranscriber(
                settings.whisper_model, settings.whisper_device, settings.whisper_compute_type
            ),
            settings.media_dir,
            Summarizer(llm_client or ollama),
        )
        app.state.settings = settings
        app.state.llm_status_client = ollama
        app.state.session_factory = session_factory
        app.state.worker = worker
        worker.start()
        yield
        worker.stop()
        engine.dispose()

    configure_logging()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition", "X-Request-ID"],
    )
    app.include_router(api_router, prefix="/api/v1")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
