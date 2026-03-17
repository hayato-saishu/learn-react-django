# FastAPI バックエンド解説

## 概要

FastAPI は Python 製の非同期対応 Web フレームワーク。Django より軽量で、型ヒントから自動的に API ドキュメント（Swagger UI）を生成する。

---

## ディレクトリ構成

```
backend/
├── app/
│   ├── main.py          # FastAPI アプリ本体、CORS、ルーター登録
│   ├── database.py      # DB エンジン、セッション管理
│   ├── models.py        # SQLModel テーブル定義（ORM モデル）
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
| SQLModel | ORM（SQLAlchemy + Pydantic を統合） |
| passlib[bcrypt] | パスワードハッシュ化 |
| python-jose | JWT トークン生成・検証（Phase 1 で使用） |
| uvicorn | ASGI サーバー（開発・本番） |
| pytest + httpx | テスト |

---

## 各ファイルの役割

### `app/main.py`

```python
app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, ...)
app.include_router(accounts.router, prefix="/api")
```

- `lifespan`: アプリ起動時に DB テーブルを自動作成
- `CORSMiddleware`: フロントエンド（localhost:5173）からのリクエストを許可

### `app/database.py`

- `create_engine(DATABASE_URL)`: SQLite に接続
- `get_session()`: FastAPI の Depends で使う DI 用ジェネレーター

### `app/models.py`

```python
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True)
    ...
```

- `table=True` を指定すると DB テーブルとして扱われる
- `Field(unique=True)` で一意制約

### `app/schemas/accounts.py`

- `RegisterRequest`: リクエストボディの型定義 + バリデーション
- `RegisterResponse`: レスポンスの型定義（パスワードは含めない）
- `@field_validator`: カスタムバリデーションロジック

### `app/api/accounts.py`

```python
@router.post("/register/", response_model=RegisterResponse, status_code=201)
def register(body: RegisterRequest, session: Session = Depends(get_session)):
    ...
```

- `Depends(get_session)`: セッションの DI（テスト時はオーバーライド可能）
- `response_model=RegisterResponse`: レスポンスを自動フィルタリング

---

## テストの仕組み

```python
# conftest.py
@pytest.fixture
def session_fixture():
    engine = create_engine("sqlite://", poolclass=StaticPool)  # インメモリ DB
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session

@pytest.fixture
def client_fixture(session):
    app.dependency_overrides[get_session] = lambda: session  # DI を差し替え
    return TestClient(app)
```

- テストごとにインメモリ DB を使用 → 本番 DB を汚染しない
- `dependency_overrides` で本番 DB セッションをテスト用に差し替え

---

## API 動作確認

サーバー起動後、以下の URL で Swagger UI を確認できる:

```
http://localhost:8000/docs
```
