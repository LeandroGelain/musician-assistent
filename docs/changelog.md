# Changelog

## 2026-05-10

### Added
- Endpoint protegido `GET /api/partituras/{id}/source` para servir o arquivo original importado (`.mxl`, `.xml` ou `.pdf`) para o usuario dono da partitura.
- Nova pagina frontend de visualizacao v2 com AlphaTab em `/partituras/:id/v2`.
- Novo fluxo no controller frontend para buscar o arquivo fonte da partitura com cookie de autenticacao e carregar no AlphaTab via bytes.
- Novo teste de integracao backend validando retorno do endpoint `/api/partituras/{id}/source` no fluxo principal de partitura.

### Changed
- Lista de partituras ganhou atalho para abrir a visualizacao v2 (AlphaTab).
- Viewer v1 ganhou botao de navegacao para a visualizacao v2.

### Notes
- O plugin `@coderline/alphatab-vite` apresentou incompatibilidade com Vite 8 neste projeto. A integracao foi concluida usando `@coderline/alphatab` diretamente com modo de player desabilitado para foco na renderizacao de partitura.

## 2026-05-03

### Added
- Nova feature de Partituras com API protegida em `/api/partituras`.
- Upload de PDF com persistencia em disco por usuario e metadados no banco.
- Pipeline de parse automatico inicial para extrair notas e ritmo a partir de padrao textual no PDF (ex.: `C4/q`, `D#4/e`, `C4+E4+G4/h`).
- Conversao de notas para frequencias (Hz) e duracao temporal (`duration_beats`, `duration_ms`) com suporte a acordes e vozes.
- Exportacao de partitura em JSON estruturado para uso em features futuras.
- Novas telas frontend: lista/importacao de partituras e viewer em pauta SVG inspirado no fluxo de leitura de partitura.
- Novas rotas protegidas no frontend: `/partituras` e `/partituras/:id`.
- Testes de integracao backend para fluxo completo da nova feature.

### Changed
- `apiRequest` do frontend passou a suportar `FormData` sem forcar `Content-Type: application/json`.
- Dashboard ganhou novo card de acesso rapido para Partituras.

### Notes
- O parse automatico atual foi implementado como etapa inicial de OMR e depende de tokens de nota/duracao extraiveis do PDF; partituras apenas em imagem podem exigir pipeline OMR dedicado em evolucao posterior.

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
