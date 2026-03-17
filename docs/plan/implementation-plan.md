# Implementation Plan — React + FastAPI

## Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Backend:** FastAPI + SQLModel (SQLAlchemy + Pydantic) + SQLite
- **Auth:** JWT (python-jose) + bcrypt (passlib)

---

## Phase 0: User Registration ✅ Complete

**Goal:** POST `/api/accounts/register/` でユーザー作成

- FastAPI プロジェクト構成
- SQLModel による User モデル
- パスワードの bcrypt ハッシュ化
- 重複ユーザー名・メールのバリデーション
- pytest テスト 6/6 パス

---

## Phase 1: Login / JWT 認証

**Goal:** トークンベースの認証フロー実装

- POST `/api/accounts/login/` → access token 返却
- JWT トークン生成・検証ユーティリティ
- `GET /api/accounts/me/` — 認証済みユーザー情報取得
- フロントエンドのトークン保存・Axios ヘッダー付与
- ログアウト（フロントエンド側トークン削除）

---

## Phase 2: Task / Todo CRUD API

**Goal:** タスクの作成・取得・更新・削除

- Task モデル（title, description, completed, owner_id）
- POST   `/api/tasks/`         — 作成
- GET    `/api/tasks/`         — 一覧（自分のタスクのみ）
- GET    `/api/tasks/{id}/`    — 詳細
- PATCH  `/api/tasks/{id}/`    — 更新
- DELETE `/api/tasks/{id}/`    — 削除
- 認証必須（JWT ヘッダー検証）

---

## Phase 3: UI 改善

**Goal:** フロントエンドの使いやすさ向上

- React Router によるページ遷移（登録・ログイン・タスク一覧）
- タスクのフィルタリング（完了/未完了）
- タスクのソート（作成日・タイトル）

---

## Phase 4: テスト強化 + デプロイ

**Goal:** 品質担保とデプロイ

- バックエンド: テストカバレッジ 80%+
- フロントエンド: Vitest カバレッジ 80%+
- Docker Compose による本番相当環境構築
- デプロイ先検討（Railway / Render / Vercel + Railway など）
