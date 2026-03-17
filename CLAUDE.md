# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A learning project for React + FastAPI, implementing a full-stack web application. Phase 0 (User Registration) is complete. The project is a Japanese learning exercise (`ReactとFastAPIの勉強用`).

## Commands

### Backend (FastAPI)

```bash
cd backend
venv/Scripts/activate                 # Windows

uvicorn app.main:app --reload         # Dev server at http://localhost:8000
# Swagger UI: http://localhost:8000/docs

pytest                                # Run all tests
pytest tests/test_registration.py    # Run single test file
pytest -k "test_name"                # Run single test by name
```

### Frontend (React + Vite)

```bash
cd frontend

npm run dev                           # Dev server at http://localhost:5173
npm run build                         # Production build to dist/
npm run lint                          # ESLint check
npm test                              # Vitest watch mode
npm test -- --run                     # Run tests once
npm run test:coverage                 # Coverage report
```

## Architecture

**Stack:** React 19 + TypeScript + Vite (frontend) ↔ FastAPI + SQLModel (backend) over REST API

**CORS:** Backend allows `http://localhost:5173`. Configured in `backend/app/main.py`.

**API Base URL:** `http://localhost:8000/api/` — set in `frontend/src/api/client.ts` (Axios instance).

### Backend layout

```
backend/
├── app/
│   ├── main.py          # FastAPI app, CORS, router registration
│   ├── database.py      # SQLite engine, session DI
│   ├── models.py        # SQLModel table models (ORM)
│   ├── api/
│   │   └── accounts.py  # /api/accounts/* endpoints
│   └── schemas/
│       └── accounts.py  # Pydantic request/response schemas
├── tests/
│   ├── conftest.py      # pytest fixtures (in-memory DB, test client)
│   └── test_registration.py
├── requirements.txt
└── pytest.ini
```

### Frontend layout

- `src/api/` — Axios client (single instance, base URL configured here) — `.ts`
- `src/components/` — Reusable UI components — `.tsx`
- `src/pages/` — Full-page views that compose components — `.tsx`
- `src/__tests__/` — Vitest + React Testing Library tests — `.test.tsx`
- `tsconfig.json` — TypeScript compiler config (`strict` mode, `bundler` module resolution)

### Current API endpoints

| Method | Path | Auth | Status |
|--------|------|------|--------|
| POST | `/api/accounts/register/` | None | ✅ Complete |

### Planned phases (from `docs/plan/implementation-plan.md`)

- Phase 1: Login/logout, JWT token authentication
- Phase 2: Task/Todo model with full CRUD API
- Phase 3: UI improvements (routing, filters, sorting)
- Phase 4: Test coverage + deployment

## Testing

- **Backend:** pytest + httpx TestClient. Config in `backend/pytest.ini`. Tests live in `tests/test_*.py`.
- **Frontend:** Vitest + React Testing Library. Setup in `frontend/src/setupTests.ts`. Tests in `src/__tests__/`.
- Backend: 6/6 tests passing (Phase 0). Frontend: 6/6 tests passing (Phase 0).

## Notes

- Python 3.14 uses `from __future__ import annotations` in `models.py` for SQLModel compatibility.
- `bcrypt==4.2.1` pinned — bcrypt 5.x is incompatible with passlib 1.7.4.
