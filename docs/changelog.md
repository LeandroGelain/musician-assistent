# Changelog

## 2026-05-01

### Added
- Monorepo structure with `frontend` and `backend`.
- Frontend React app with routes, auth context and protected areas.
- TailwindCSS integration and custom visual identity.
- PWA basics with web manifest and service worker.
- Backend FastAPI MVC with SQLAlchemy models.
- Auth API with register/login/me/logout using HttpOnly cookie JWT.
- Repertorio API with list/create/delete.
- Metronomo API with read/update settings.
- Afinador API with read/update settings.
- Afinador screen with real-time note detection via microphone.
- Realtime audio websocket endpoint `/ws/audio`.
- Docker Compose with `frontend`, `backend` and `postgres` services.
- Backend and frontend Dockerfiles for local orchestration.
- Backend integration tests for auth, repertorio and metronomo.

### Notes
- Audio websocket is currently scaffolded as transport layer and echo flow.
- Next phase should implement actual audio feature extraction and inference pipeline.

### Changed
- Default database moved from SQLite to PostgreSQL.
