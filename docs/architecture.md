# Architecture

## Overview
This project uses a monorepo with frontend and backend separated:

- frontend: React + Vite + TailwindCSS + PWA shell
- backend: FastAPI + SQLAlchemy in MVC style

## MVC Mapping

### Frontend
- Model: client state and typed DTOs in feature controllers
- View: page components in `src/pages`
- Controller: request logic in `src/features/*/*Controller.ts`

### Backend
- Model: SQLAlchemy entities in `backend/app/models`
- View: JSON responses via Pydantic schemas in `backend/app/schemas`
- Controller: API routes in `backend/app/api` and business rules in `backend/app/services`

## Current Screens
- Cadastro de usuario
- Login com autenticacao backend
- Tela padrao com opcoes para Metronomo e Repertorio
- Tela de Metronomo
- Tela de Repertorio

## Realtime Audio Direction
The current backend exposes `/ws/audio` for realtime integrations. Next increments can add audio feature extraction and model inference while preserving this transport interface.
