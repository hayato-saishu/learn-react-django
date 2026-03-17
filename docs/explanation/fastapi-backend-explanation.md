# FastAPI バックエンド解説（初心者向け）

## 概要

FastAPI は Python で書かれた Web フレームワーク。
「フレームワーク」とは、Web アプリを作るための土台となるライブラリのこと。

FastAPI の特徴:
- **型ヒント**（`str`, `int` などの型の宣言）を使って自動でバリデーション（入力チェック）を行う
- **Swagger UI** という API の動作確認画面を自動生成する（`http://localhost:8000/docs`）
- 非同期処理（`async/await`）に対応しており、高速に動作する

---

## ディレクトリ構成

```
backend/
├── app/
│   ├── main.py          # FastAPI アプリ本体、CORS、ルーター登録
│   ├── database.py      # DB エンジン、セッション管理
│   ├── models.py        # SQLModel テーブル定義（ORM モデル）
│   ├── deps.py          # 認証用の依存関係（Phase 1 で追加）
│   ├── security.py      # JWT トークン生成・検証（Phase 1 で追加）
│   ├── api/
│   │   └── accounts.py  # /api/accounts/* エンドポイント
│   └── schemas/
│       └── accounts.py  # リクエスト/レスポンスの Pydantic スキーマ
├── tests/
│   ├── conftest.py      # pytest フィクスチャ（テスト用 DB・クライアント）
│   └── test_registration.py
├── requirements.txt
└── pytest.ini
```

---

## 主要ライブラリ

| ライブラリ | 役割 |
|-----------|------|
| FastAPI | Web フレームワーク、ルーティング、バリデーション |
| SQLModel | ORM（Python オブジェクト ↔ DB テーブルを対応付ける） |
| passlib[bcrypt] | パスワードをハッシュ化（元に戻せない形に変換）する |
| python-jose | JWT トークン生成・検証（Phase 1 で使用） |
| uvicorn | ASGI サーバー（Python アプリを HTTP で動かす） |
| pytest + httpx | テスト |

> **ORM とは？**
> Object-Relational Mapping の略。
> Python のクラスを DB のテーブルと対応させることで、SQL を直接書かなくてもデータを操作できる仕組み。

---

## `app/main.py` — アプリの起点

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import create_db_and_tables
from app.api import accounts


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield


app = FastAPI(title="Learn React + FastAPI", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(accounts.router, prefix="/api")
```

### `lifespan` 関数

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield
```

- **`@asynccontextmanager`**: 「非同期コンテキストマネージャー」を作るデコレーター。
  `with` 文で使えるオブジェクトを非同期関数から生成する。
- **`async def`**: 非同期関数の宣言。通常の `def` の代わりに使う。
- **引数 `app: FastAPI`**: `app` という名前で `FastAPI` 型の引数を受け取る。型ヒントの書き方。
- **`create_db_and_tables()`**: DB テーブルを作成する自作関数（`database.py` に定義）。
- **`yield`**: ここで処理を一時停止し、アプリが動いている間は待機する。
  `yield` より前が「起動時の処理」、`yield` より後が「終了時の処理」になる。
- **役割**: アプリ起動時に一度だけ DB テーブルを自動作成する。

### `FastAPI(...)` — アプリインスタンスの作成

```python
app = FastAPI(title="Learn React + FastAPI", lifespan=lifespan)
```

- `FastAPI()` を呼び出してアプリオブジェクトを作成する。
- **`title=`**: Swagger UI に表示されるタイトル（省略可能）。
- **`lifespan=lifespan`**: 上で定義した `lifespan` 関数を渡す。アプリの起動・終了時の処理を登録する。

### `app.add_middleware(...)` — CORS の設定

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

> **CORS とは？**
> ブラウザのセキュリティ機能。異なるオリジン（ドメイン・ポート）への HTTP リクエストをデフォルトでブロックする。
> フロントエンド（`localhost:5173`）からバックエンド（`localhost:8000`）に API を叩くには CORS の許可が必要。

- **`CORSMiddleware`**: CORS を制御するミドルウェア（リクエスト・レスポンスの間に挟まる処理）。
- **`allow_origins`**: アクセスを許可するオリジンのリスト。`["http://localhost:5173"]` はフロントエンドの URL。
- **`allow_credentials=True`**: Cookie や認証情報を含むリクエストを許可する。
- **`allow_methods=["*"]`**: `*` はすべての HTTP メソッド（GET, POST, PUT, DELETE 等）を許可。
- **`allow_headers=["*"]`**: すべての HTTP ヘッダーを許可。

### `app.include_router(...)` — ルーターの登録

```python
app.include_router(accounts.router, prefix="/api")
```

- **`accounts.router`**: `api/accounts.py` で定義された `APIRouter` オブジェクト。
- **`prefix="/api"`**: このルーターに登録されたすべてのエンドポイントに `/api` を先頭に付ける。
  例: `accounts.py` の `/accounts/register/` → 実際の URL は `/api/accounts/register/`

---

## `app/database.py` — DB の設定

```python
from sqlmodel import SQLModel, Session, create_engine

DATABASE_URL = "sqlite:///./db.sqlite3"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
```

### `create_engine(...)` — DB への接続設定

```python
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
```

- **`create_engine`**: DB への接続設定（エンジン）を作成する関数。
- **`DATABASE_URL`**: DB の場所を示す URL。`sqlite:///./db.sqlite3` はプロジェクトルートの `db.sqlite3` ファイルを使う。
- **`connect_args={"check_same_thread": False}`**: SQLite 特有の設定。
  SQLite はデフォルトで「同じスレッドからしか使えない」制限があるが、`False` にして FastAPI の非同期処理に対応させる。

### `create_db_and_tables()` — テーブル作成

```python
def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
```

- **戻り値 `-> None`**: この関数は何も返さない（`None` を返す）。戻り値の型ヒント。
- **`SQLModel.metadata`**: 登録されているすべての SQLModel テーブルの情報を持つオブジェクト。
- **`create_all(engine)`**: `metadata` に登録されたテーブルを DB に作成する。すでに存在する場合はスキップ。

### `get_session()` — セッションの DI 用ジェネレーター

```python
def get_session():
    with Session(engine) as session:
        yield session
```

> **セッションとは？**
> DB との「会話の単位」。セッションを通じてデータの読み書きを行い、最後に `commit`（確定）または `rollback`（取り消し）する。

- **`Session(engine)`**: `engine` を使って DB セッションを作成する。
- **`with ... as session`**: `with` ブロックを抜けると自動でセッションが閉じられる（リソースリーク防止）。
- **`yield session`**: セッションを呼び出し元に渡す。`yield` を使うことでジェネレーター関数になる。
- **使い方**: `Depends(get_session)` と組み合わせて FastAPI の **依存性注入（DI）** に使う。

> **依存性注入（DI）とは？**
> 関数が必要とするオブジェクト（依存物）を外から渡す仕組み。
> `Depends(get_session)` と書くと、FastAPI がリクエストのたびに `get_session()` を呼び出してセッションを自動で渡してくれる。
> テスト時はこの依存を差し替えることができる（`dependency_overrides`）。

---

## `app/models.py` — DB テーブルの定義

```python
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True, max_length=150)
    email: str = Field(unique=True, index=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    __tablename__ = "users"
```

### クラス宣言

```python
class User(SQLModel, table=True):
```

- **`class User`**: `User` という名前のクラスを定義する。
- **`SQLModel`**: SQLModel の基底クラスを継承する。
- **`table=True`**: このクラスを DB のテーブルとして扱うことを SQLModel に伝える。
  `table=True` がないと、単なる Pydantic スキーマ（データ検証用）として扱われる。

### フィールド定義（カラムの宣言）

```python
id: Optional[int] = Field(default=None, primary_key=True)
```

- **`id`**: カラム名。
- **`: Optional[int]`**: 型ヒント。`Optional[int]` は「`int` または `None`」という意味。
  `Optional[X]` は `Union[X, None]` の省略形。
- **`= Field(...)`**: SQLModel の `Field` 関数でカラムの詳細設定を行う。
- **`default=None`**: デフォルト値は `None`（DB が自動採番するため、最初は `None` でよい）。
- **`primary_key=True`**: このカラムを主キー（テーブル内でレコードを一意に識別する列）に設定する。

```python
username: str = Field(unique=True, index=True, max_length=150)
```

- **`unique=True`**: 同じ値を重複して登録できない制約（一意制約）を付ける。
- **`index=True`**: このカラムに DB インデックスを作成する。検索を高速化する。
- **`max_length=150`**: SQLModel が文字列の最大長を設定する（DB のカラム定義に反映）。

```python
created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

- **`datetime`**: 日時を表す Python の型。
- **`default_factory=`**: デフォルト値に「呼び出し可能なオブジェクト（関数）」を指定する。
  `default=` と違い、レコードを作成するたびに関数が実行されるため、常に「今の時刻」が入る。
- **`lambda: datetime.now(timezone.utc)`**: ラムダ式（無名関数）。引数なし、UTC の現在時刻を返す。

### `from __future__ import annotations`

Python 3.14 での SQLModel の互換性のために必要。
型ヒントの評価を遅延させる（「文字列として扱う」）ことで、循環参照などの問題を回避する。

---

## `app/schemas/accounts.py` — リクエスト・レスポンスの型定義

```python
from pydantic import BaseModel, EmailStr, field_validator


class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str

    @field_validator("username")
    @classmethod
    def username_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("username must not be empty")
        if len(v) > 150:
            raise ValueError("username must be 150 characters or fewer")
        return v

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("password must be at least 8 characters")
        return v


class RegisterResponse(BaseModel):
    id: int
    username: str
    email: str
```

> **スキーマとは？**
> リクエストボディやレスポンスの「形（構造）」を定義するもの。
> FastAPI はこのスキーマを使って自動でバリデーション（入力値の検証）を行う。

### `BaseModel` の継承

```python
class RegisterRequest(BaseModel):
```

- **`BaseModel`**: Pydantic のクラス。これを継承することで、型ヒントに基づいた自動バリデーションが有効になる。
- `SQLModel` の `table=True` とは異なり、**DB テーブルではなく**「データの形」だけを定義する。

### `EmailStr`

```python
email: EmailStr
```

- `str` の代わりに `EmailStr` を使うと、`test@example.com` のような正しいメールアドレス形式かを自動で検証する。

### `@field_validator` デコレーター

```python
@field_validator("username")
@classmethod
def username_not_empty(cls, v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("username must not be empty")
    ...
    return v
```

- **`@field_validator("username")`**: `username` フィールドにカスタムバリデーションを追加するデコレーター。
  `"username"` の部分にバリデーション対象のフィールド名を指定する。
- **`@classmethod`**: インスタンスではなくクラス自体に紐づくメソッドにする。`field_validator` を使う場合は必須。
- **引数 `cls`**: クラス自身を受け取る（`@classmethod` の慣習）。
- **引数 `v: str`**: バリデーション対象の値。`v` は "value" の略。型ヒントで `str` と宣言。
- **戻り値 `-> str`**: バリデーション後の値（`str` 型）を返す必要がある。変換や正規化（`strip()` など）もここで行う。
- **`raise ValueError(...)`**: バリデーション失敗時に例外を発生させる。FastAPI が自動で 422 エラーとしてレスポンスを返す。
- **`v.strip()`**: 文字列の前後の空白を取り除くメソッド。

### `RegisterResponse`

```python
class RegisterResponse(BaseModel):
    id: int
    username: str
    email: str
```

- レスポンスとして返す情報を定義する。`password` は含まれていない。
- `response_model=RegisterResponse` と設定することで、エンドポイントはこのクラスに定義したフィールドだけをレスポンスとして返す（**パスワードなど不要な情報が漏れない**）。

---

## `app/api/accounts.py` — エンドポイントの実装

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.models import User
from app.schemas.accounts import RegisterRequest, RegisterResponse
from passlib.context import CryptContext

router = APIRouter(prefix="/accounts", tags=["accounts"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


@router.post(
    "/register/",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(body: RegisterRequest, session: Session = Depends(get_session)):
    # ユーザー名の重複チェック
    existing_username = session.exec(
        select(User).where(User.username == body.username)
    ).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"username": ["A user with that username already exists."]},
        )

    # メールアドレスの重複チェック
    existing_email = session.exec(
        select(User).where(User.email == body.email)
    ).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"email": ["A user with that email already exists."]},
        )

    # ユーザーの作成
    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    return RegisterResponse(id=user.id, username=user.username, email=user.email)
```

### `APIRouter` — ルーターの作成

```python
router = APIRouter(prefix="/accounts", tags=["accounts"])
```

- **`APIRouter`**: エンドポイントをグループ化するクラス。`main.py` に直接書かずに分割できる。
- **`prefix="/accounts"`**: このルーターのすべてのエンドポイントに `/accounts` を先頭に付ける。
  `main.py` で `prefix="/api"` を付けているので、最終的な URL は `/api/accounts/register/` になる。
- **`tags=["accounts"]`**: Swagger UI でグループ名として表示されるラベル。

### `CryptContext` — パスワードのハッシュ化

```python
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)
```

- **`CryptContext`**: passlib のクラス。複数のハッシュアルゴリズムを管理する。
- **`schemes=["bcrypt"]`**: ハッシュアルゴリズムに `bcrypt` を使うよう指定する。
  `bcrypt` は同じパスワードでも毎回異なるハッシュを生成するため、レインボーテーブル攻撃に強い。
- **`hash_password(password: str) -> str`**: 平文パスワードを受け取り、ハッシュ文字列を返す関数。

### `@router.post(...)` デコレーター — エンドポイントの登録

```python
@router.post(
    "/register/",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
```

- **`@router.post(...)`**: `POST` メソッドのエンドポイントを登録するデコレーター。
- **`"/register/"`**: エンドポイントのパス。`prefix` と合わせて `/api/accounts/register/` になる。
- **`response_model=RegisterResponse`**: レスポンスの型を指定する。
  FastAPI がレスポンスデータをこのスキーマに変換・フィルタリングする（パスワードなどを除外できる）。
- **`status_code=status.HTTP_201_CREATED`**: 成功時の HTTP ステータスコードを `201 Created` に設定する。
  デフォルトは `200 OK` だが、新規リソース作成時は `201` が適切。

### `register` 関数の引数

```python
def register(body: RegisterRequest, session: Session = Depends(get_session)):
```

- **`body: RegisterRequest`**: リクエストボディを `RegisterRequest` 型として受け取る。
  FastAPI が自動でリクエストの JSON を `RegisterRequest` オブジェクトに変換・バリデーションする。
- **`session: Session`**: DB セッションの型ヒント。
- **`= Depends(get_session)`**: `get_session` を DI（依存性注入）として指定する。
  リクエストのたびに `get_session()` が呼ばれてセッションが渡される。

### DB からのデータ取得

```python
existing_username = session.exec(
    select(User).where(User.username == body.username)
).first()
```

- **`select(User)`**: `User` テーブルの全カラムを選択する SQL の `SELECT * FROM users` に相当。
- **`.where(User.username == body.username)`**: 絞り込み条件を追加する。`WHERE username = ?` に相当。
- **`session.exec(...)`**: 組み立てたクエリを実行する。結果のイテレーター（複数件）が返る。
- **`.first()`**: 最初の1件だけ取得する。該当なしの場合は `None` を返す。

### エラーレスポンスの返し方

```python
raise HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail={"username": ["A user with that username already exists."]},
)
```

- **`HTTPException`**: HTTP エラーレスポンスを返すための例外クラス。
- **`raise`**: 例外を発生させる。FastAPI が自動でキャッチしてエラーレスポンスを返す。
- **`status_code=status.HTTP_400_BAD_REQUEST`**: HTTP ステータスコード `400`（クライアントエラー）を設定。
- **`detail=`**: レスポンスボディの `detail` キーに含まれるエラー情報。辞書や文字列を指定できる。

### ユーザーの保存

```python
user = User(
    username=body.username,
    email=body.email,
    hashed_password=hash_password(body.password),
)
session.add(user)
session.commit()
session.refresh(user)
```

- **`User(...)`**: `User` モデルのインスタンスを作成する。
- **`session.add(user)`**: セッションにユーザーを追加する（まだ DB には保存されない）。
- **`session.commit()`**: DB にトランザクションをコミット（確定）する。ここで初めて DB に保存される。
- **`session.refresh(user)`**: DB から最新データを `user` オブジェクトに再読み込みする。
  `commit` 後に DB が自動採番した `id` などを `user` オブジェクトに反映させるために必要。

---

## `tests/conftest.py` — テスト用のフィクスチャ

```python
import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine
from sqlmodel.pool import StaticPool

from app.main import app
from app.database import get_session


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    app.dependency_overrides[get_session] = get_session_override
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
```

> **フィクスチャとは？**
> テストの「前準備」を担う関数。`@pytest.fixture` デコレーターで宣言し、テスト関数の引数に同名の変数を書くと自動で実行・注入される。

### `session_fixture`

```python
@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",          # "sqlite://" はインメモリ DB（ファイルを作らない）
        connect_args={"check_same_thread": False},
        poolclass=StaticPool, # 同じコネクションを使い続ける（テスト用の設定）
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
```

- **`@pytest.fixture(name="session")`**: `name="session"` でテスト関数の引数名を `session` に設定する。
- **`"sqlite://"`**: ファイルパスなしの SQLite URL。これでメモリ上にのみ存在する一時的な DB が作られる。
  ファイルを作らないため、テスト後に自動で消える。本番 DB を汚染しない。
- **`poolclass=StaticPool`**: テスト中に同じインメモリ DB のコネクションを使い続けるための設定。
  デフォルトではコネクションごとに別のインメモリ DB が作られてしまう問題を防ぐ。
- **`yield session`**: テスト関数にセッションを渡す。テスト終了後、`with` ブロックを抜けてセッションが閉じられる。

### `client_fixture`

```python
@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    app.dependency_overrides[get_session] = get_session_override
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
```

- **引数 `session: Session`**: `session_fixture` で作成されたセッションを受け取る（フィクスチャの依存関係）。
- **`app.dependency_overrides`**: FastAPI の DI（依存性注入）を上書きするための辞書。
- **`app.dependency_overrides[get_session] = get_session_override`**:
  本番用の `get_session` をテスト用の `get_session_override` に差し替える。
  これでテスト中はインメモリ DB が使われる。
- **`TestClient(app)`**: FastAPI アプリを実際に HTTP サーバーを起動せずにテストするためのクライアント。
- **`app.dependency_overrides.clear()`**: テスト後に差し替えをリセットする（テスト間の独立性を保つ）。

---

## リクエストの流れ（ユーザー登録の例）

```
ブラウザ（React）
    │
    │  POST /api/accounts/register/
    │  Body: { "username": "alice", "email": "alice@example.com", "password": "secret123" }
    ▼
FastAPI（main.py）
    │ CORSMiddleware でオリジンを確認
    │ include_router で /api/accounts/register/ を accounts.py の register() に振り分け
    ▼
register 関数（api/accounts.py）
    │ body: RegisterRequest でリクエストボディをバリデーション
    │ session: Depends(get_session) でDB セッションを取得
    │ ユーザー名・メールの重複チェック
    │ パスワードをハッシュ化
    │ session.add / commit / refresh でDBに保存
    ▼
RegisterResponse
    │ { "id": 1, "username": "alice", "email": "alice@example.com" }
    ▼
ブラウザへ返却（HTTP 201 Created）
```
