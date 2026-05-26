---
applyTo: "frontend/src/pages/**,frontend/src/features/**,backend/app/api/**,backend/app/services/**,backend/app/models/**,backend/app/schemas/**"
---

# Regra: Toda tela exige API completa no backend

Sempre que uma nova tela (Page) ou feature for criada ou modificada no frontend, **todos os endpoints backend correspondentes devem ser implementados na mesma entrega**, seguindo a arquitetura MVC do projeto.

## O que deve ser criado para cada tela nova

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| Model | `backend/app/models/<feature>.py` | Tabela SQLAlchemy com FK para `users`, exportar em `models/__init__.py` |
| Schema | `backend/app/schemas/<feature>.py` | `<Feature>Input` e `<Feature>Output` com `model_config = ConfigDict(from_attributes=True)` |
| Service | `backend/app/services/<feature>_service.py` | Lógica de negócio (get, create, update, delete) |
| Router | `backend/app/api/<feature>_routes.py` | Endpoints FastAPI com `get_current_user` em todas as rotas protegidas |
| Registro | `backend/app/api/router.py` | Incluir o novo router com prefixo `/api/<feature>` |
| Controller | `frontend/src/features/<feature>/<feature>Controller.ts` | Funções que chamam `apiRequest<T>` de `src/app/api.ts` |
| Teste | `backend/tests/test_<feature>.py` | Pelo menos um teste de integração cobrindo o fluxo principal |

## Checklist obrigatório ao criar tela

- [ ] Model criado e exportado em `models/__init__.py`
- [ ] Schema usa `ConfigDict(from_attributes=True)` (nunca `class Config`)
- [ ] Todas as rotas protegidas têm `current_user: User = Depends(get_current_user)`
- [ ] Router registrado em `api/router.py`
- [ ] Controller frontend usa `apiRequest` com `credentials: 'include'`
- [ ] Rota frontend protegida com `<ProtectedRoute>` em `App.tsx`
- [ ] Pelo menos um teste de integração passando

## Quando não souber como implementar

Se o objetivo da tela for ambíguo ou envolver lógica de domínio desconhecida (ex: integração externa, processamento de áudio no backend, streaming), **perguntar antes de implementar**:
- Qual dado precisa ser persistido?
- O endpoint deve ser autenticado?
- Existe algum processamento especial (ex: upload de arquivo, WebSocket)?

## Exemplo de estrutura para uma tela nova "Exercicios"

```
backend/app/models/exercicio.py       → Tabela Exercicio (user_id FK)
backend/app/schemas/exercicio.py      → ExercicioInput / ExercicioOutput
backend/app/services/exercicio_service.py → CRUD
backend/app/api/exercicio_routes.py   → GET/POST/PUT/DELETE /api/exercicios
backend/tests/test_exercicio.py       → teste de integração
frontend/src/features/exercicio/exercicioController.ts → apiRequest calls
frontend/src/pages/ExercicioPage.tsx  → tela com ProtectedRoute em App.tsx
```
