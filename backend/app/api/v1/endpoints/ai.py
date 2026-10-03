from fastapi import APIRouter, Depends

from app.core.deps import get_llm_status_client
from app.schemas.job import AIStatusResponse
from app.services.llm import OllamaClient

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/status", response_model=AIStatusResponse)
def ai_status(client: OllamaClient = Depends(get_llm_status_client)) -> AIStatusResponse:
    """Is Ollama running and is the configured model installed?"""
    st = client.status()
    return AIStatusResponse(
        reachable=st.reachable,
        model=st.model,
        model_installed=st.model_installed,
        installed_models=st.installed_models,
        error=st.error,
    )
