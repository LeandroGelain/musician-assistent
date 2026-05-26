# Musician Assistant — Project Guidelines

## Stack Overview

- **Frontend**: React 19, Vite 8, TypeScript (strict), Tailwind CSS 4 via `@tailwindcss/vite`
- **Backend**: FastAPI, SQLAlchemy (async-capable), PostgreSQL 16 via `psycopg` (v3 driver)
- **Auth**: JWT em HttpOnly cookie. Hash de senha: `pbkdf2_sha256` (não usar bcrypt — falha no Windows/Python 3.13)
- **Infra**: Docker Compose orquestra `postgres`, `backend`, `frontend`
- **PWA**: Manual (sem vite-plugin-pwa, incompatível com Vite 8) — `public/manifest.json` + `public/sw.js`

## Architecture

Padrão MVC dividido por camadas:

```
backend/app/
  models/          # SQLAlchemy ORM models
  schemas/         # Pydantic I/O (InputSchema / OutputSchema por feature)
  services/        # regras de negócio
  api/             # routers FastAPI (um arquivo por feature)
  core/            # config, auth utils
  db.py            # engine + Session + init_db()
  main.py          # bootstrap FastAPI com lifespan handler

frontend/src/
  pages/           # uma Page por rota (ex: AfinadorPage.tsx)
  features/<name>/ # controller + types por feature
  app/             # api.ts (apiRequest helper), configurações globais
  components/      # componentes reutilizáveis
```

## Backend Conventions

- **Pydantic v2**: usar `model_config = ConfigDict(from_attributes=True)` — nunca `class Config`
- **FastAPI lifecycle**: usar `@asynccontextmanager` com `lifespan=` — nunca `@app.on_event('startup')`
- **Router**: cada feature tem seu próprio arquivo em `api/`, registrado em `api/router.py`
- **Auth**: `get_current_user` via dependency injection em todas as rotas protegidas
- **Models**: sempre exportar em `models/__init__.py` para `init_db` importar corretamente
- **Relacionamentos**: configurar `back_populates` e `cascade='all, delete-orphan'` onde aplicável

## Frontend Conventions

- **Padrão de chamada API**: usar `apiRequest<T>` de `src/app/api.ts` com `credentials: 'include'`
- **Controller por feature**: `src/features/<nome>/<nome>Controller.ts` encapsula chamadas à API
- **Proteção de rotas**: envolver em `<ProtectedRoute>` no `App.tsx`
- **Estilo**: Tailwind utilitários + variáveis CSS globais (ver `src/index.css`)
  - Classes reutilizáveis: `.card`, `.btn-primary`
- **CSS vars**: `--bg`, `--paper`, `--ink`, `--brand`, `--brand-soft`, `--accent`
- **Fonte**: Manrope (body), Space Grotesk (headings)

## Docker / Dev Environment

- **Hot reload backend**: volume `./backend/app:/app/app` + uvicorn `--reload`
- **Hot reload frontend**: volume `./frontend/src:/app/src` e `./frontend/public:/app/public`
  - Vite polling: `usePolling: true, interval: 200` no `vite.config.ts`
  - Variáveis: `CHOKIDAR_USEPOLLING=true`, `CHOKIDAR_INTERVAL=200` no docker-compose
- **Montar apenas diretórios no Windows**: nunca montar arquivo individual (ex: `index.html`) como volume — Docker cria diretório no lugar do arquivo no Windows
- **Rebuild necessário apenas quando**: mudar `requirements.txt` ou `package.json`

## Tests

- **Framework**: pytest com FastAPI `TestClient`
- **Executar sempre de `backend/`**:
  ```powershell
  cd backend
  & ".venv\Scripts\python.exe" -m pytest tests -v
  ```
- **Nunca rodar com `python` sem path absoluto** — no Windows pode resolver para o Python do sistema
- **Fixtures**: SQLite em memória/arquivo temporário, isoladas por teste
- **Cobertura**: um arquivo de teste por feature (`test_auth.py`, `test_afinador.py`, etc.)

## Features Implementadas

| Feature | Rota frontend | Endpoint backend |
|---|---|---|
| Auth (login/cadastro) | `/login`, `/cadastro` | `/api/auth/*` |
| Dashboard | `/` | — |
| Metronomo | `/metronomo` | `/api/metronomo/settings` |
| Afinador | `/afinador` | `/api/afinador/settings` |
| Repertório | `/repertorio` | `/api/repertorio` |

### Afinador — Detalhes técnicos
- Detecção de nota via autocorrelação (Web Audio API, `AnalyserNode`, `fftSize=4096`, `smoothingTimeConstant=0`)
- Remoção de componente DC antes da autocorrelação
- Faixa de busca: `60 Hz` a `1200 Hz`
- Refinamento subamostral via interpolação parabólica
- Atualização da nota na UI: a cada 500ms (`NOTE_UPDATE_INTERVAL_MS`)
- Gráfico de frequência: histórico de 72 pontos, atualizado a cada 120ms, renderizado em SVG

## Documentação Interna

Ver `docs/` para detalhes adicionais:
- `docs/api.md` — endpoints e contratos
- `docs/architecture.md` — decisões de arquitetura
- `docs/decisions.md` — ADRs (Architecture Decision Records)
- `docs/changelog.md` — histórico de mudanças
