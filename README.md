# Musician Assistant

Aplicativo em arquitetura MVC com suporte PWA para navegador e Android.

## Stack

- Frontend: React + Vite + TailwindCSS
- Backend: FastAPI + SQLAlchemy + PostgreSQL
- Auth: JWT em cookie HttpOnly
- PWA: manifest + service worker
- Infra: Docker Compose com frontend, backend e postgres

## Estrutura

- `frontend/` aplicacao web PWA
- `backend/` API FastAPI em MVC
- `docs/` documentacao continua do projeto

## Requisitos

- Node.js 20+
- Python 3.11+

## Rodando frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend por padrao em `http://localhost:5173`.

## Rodando backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend por padrao em `http://localhost:8000`.

## Variaveis de ambiente backend

Copie `backend/.env.example` para `backend/.env` e ajuste os valores quando necessario.

Banco padrao:

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/musician_assistant
```

## Rodando tudo com Docker Compose

```bash
docker compose up --build
```

Servicos expostos:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- PostgreSQL: `localhost:5432`

Credenciais padrao do banco no compose:

- Database: `musician_assistant`
- User: `postgres`
- Password: `postgres`

## Telas implementadas

- Cadastro de usuario (nome, email, telefone, senha)
- Login com autenticacao backend
- Tela padrao com opcoes para Metronomo e Repertorio
- Tela de Afinador com deteccao de nota em tempo real
- Metronomo com persistencia de configuracoes
- Repertorio com cadastro e remocao de itens

## APIs implementadas

- Auth: `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`
- Metronomo: `/api/metronomo/settings`
- Afinador: `/api/afinador/settings`
- Repertorio: `/api/repertorio`
- Audio realtime (base): `ws://localhost:8000/ws/audio`

## Testes de integracao

```bash
cd backend
pip install -r requirements-dev.txt
pytest tests -v
```

Cobertura atual:

- Auth: cadastro, sessao atual, logout e rejeicao sem cookie
- Repertorio: criar, listar e remover
- Metronomo: defaults e atualizacao persistida
- Afinador: defaults e atualizacao persistida

## Documentacao

- Arquitetura: `docs/architecture.md`
- APIs: `docs/api.md`
- Decisoes: `docs/decisions.md`
- Changelog: `docs/changelog.md`

## Android

Como PWA, o app pode ser instalado no Chrome Android.
Para Play Store, o caminho recomendado e empacotar via Trusted Web Activity (Bubblewrap) na proxima fase.