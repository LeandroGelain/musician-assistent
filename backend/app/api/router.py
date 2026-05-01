from fastapi import APIRouter

from app.api import (
	afinador_routes,
	audio_ws,
	auth_routes,
	metronomo_routes,
	repertorio_routes,
)

api_router = APIRouter()
api_router.include_router(auth_routes.router)
api_router.include_router(metronomo_routes.router)
api_router.include_router(afinador_routes.router)
api_router.include_router(repertorio_routes.router)
api_router.include_router(audio_ws.router)
