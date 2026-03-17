# DBデータベース設計書 — learn-react-django TODOアプリ

## 技術スタック

- **DB エンジン:** SQLite（開発環境）
- **ORM:** SQLModel（FastAPI 公式推奨、Pydantic + SQLAlchemy の統合）
- **ファイル:** `backend/db.sqlite3`

---

## テーブル一覧

| テーブル名 | 説明 | フェーズ |
|-----------|------|--------|
| `user`    | ユーザー情報（認証用） | Phase 0 ✅ |
| `task`    | TODOタスク | Phase 2 |

---

## テーブル詳細

### `user` テーブル（既存）

| カラム名 | 型 | 制約 | 説明 |
|---------|----|------|------|
| `id` | INTEGER | PRIMARY KEY, AUTOINCREMENT | ユーザーID |
| `username` | VARCHAR(150) | UNIQUE, NOT NULL, INDEX | ログイン用ユーザー名 |
| `email` | VARCHAR | UNIQUE, NOT NULL, INDEX | メールアドレス |
| `hashed_password` | VARCHAR | NOT NULL | bcrypt ハッシュ化済みパスワード |

**モデルファイル:** `backend/app/models.py`

---

### `task` テーブル（新規追加 / Phase 2）

| カラム名 | 型 | 制約 | 説明 |
|---------|----|------|------|
| `id` | INTEGER | PRIMARY KEY, AUTOINCREMENT | タスクID |
| `title` | VARCHAR(200) | NOT NULL | タスクタイトル |
| `description` | TEXT | NULL | タスク詳細（任意） |
| `completed` | BOOLEAN | NOT NULL, DEFAULT FALSE | 完了フラグ |
| `created_at` | DATETIME | NOT NULL, DEFAULT NOW | 作成日時 |
| `updated_at` | DATETIME | NOT NULL, DEFAULT NOW | 更新日時 |
| `owner_id` | INTEGER | FOREIGN KEY → user.id, NOT NULL, INDEX | 作成者ユーザーID |

**モデルファイル:** `backend/app/models.py`（追加予定）

---

## ER図

```
user
────────────────────────────
PK  id              INTEGER
    username        VARCHAR(150)  UNIQUE
    email           VARCHAR       UNIQUE
    hashed_password VARCHAR

    1
    |
    | (1:N)
    |
    N

task
────────────────────────────
PK  id          INTEGER
    title       VARCHAR(200)
    description TEXT          NULL
    completed   BOOLEAN       DEFAULT FALSE
    created_at  DATETIME
    updated_at  DATETIME
FK  owner_id    INTEGER → user.id
```

---

## リレーション定義

| 関係 | 説明 |
|------|------|
| `user` 1 : N `task` | 1ユーザーが複数のタスクを持つ。タスクは必ず1人のオーナーを持つ。 |

- カスケード削除: ユーザー削除時に紐づくタスクも削除（`CASCADE`）

---

## インデックス設計

| テーブル | カラム | 理由 |
|---------|-------|------|
| `user` | `username` | ログイン時の検索 |
| `user` | `email` | 重複チェック・検索 |
| `task` | `owner_id` | ユーザーのタスク一覧取得 |

---

## SQLModel コード設計（参考）

```python
# backend/app/models.py（Phase 2 追加分）

from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel, Relationship


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True, max_length=150)
    email: str = Field(unique=True, index=True)
    hashed_password: str

    tasks: list["Task"] = Relationship(back_populates="owner")


class Task(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(max_length=200)
    description: Optional[str] = Field(default=None)
    completed: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    owner_id: int = Field(foreign_key="user.id", index=True)

    owner: Optional[User] = Relationship(back_populates="tasks")
```

---

## バリデーションルール

| フィールド | ルール |
|-----------|-------|
| `user.username` | 1〜150文字、空白不可 |
| `user.email` | メール形式（Pydantic `EmailStr`） |
| `user.password`（登録時） | 8文字以上 |
| `task.title` | 1〜200文字、空白不可 |
| `task.description` | 任意、最大1000文字（推奨） |

---

## 将来の拡張案（Phase 3以降）

| テーブル/カラム | 内容 |
|--------------|------|
| `task.due_date` | 期限日 |
| `task.priority` | 優先度（low / medium / high） |
| `category` テーブル | タスクカテゴリー分類 |
| `task.category_id` | カテゴリーFK |
