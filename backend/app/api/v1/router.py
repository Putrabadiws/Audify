from fastapi import APIRouter

from app.api.v1.endpoints import ai, jobs, settings, tags

api_router = APIRouter()
api_router.include_router(jobs.router)
api_router.include_router(settings.router)
api_router.include_router(tags.router)
api_router.include_router(ai.router)
