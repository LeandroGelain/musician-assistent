# Decisions

## 2026-05-01

### Frontend stack
Decision: React + Vite + TailwindCSS.
Reason: common stack with high editability by coding assistants.

### Backend stack
Decision: FastAPI + SQLAlchemy + PostgreSQL.
Reason: stronger path for multi-service local orchestration, persistence and production parity.

### Authentication
Decision: JWT stored in HttpOnly cookie.
Reason: better security posture than storing JWT in localStorage.

### PWA support
Decision: manual manifest + service worker for Vite 8 compatibility.
Reason: current vite-plugin-pwa dependency does not support Vite 8 peer range.

### Android distribution
Decision: PWA first, then package with Trusted Web Activity (Bubblewrap) to produce APK/AAB.
Reason: reuses the same PWA codebase.

### Local orchestration
Decision: Docker Compose manages frontend, backend and postgres together.
Reason: single-command startup and environment parity for development.

### Integration testing
Decision: backend integration tests run with pytest + FastAPI TestClient using isolated SQLite test database.
Reason: deterministic test execution without requiring a running PostgreSQL instance during local validation.

### Tuner feature
Decision: add an `Afinador` screen and API settings endpoint following the same architecture and layout pattern as existing feature screens.
Reason: maintain consistency in UX and simplify incremental extension of musical tools.
