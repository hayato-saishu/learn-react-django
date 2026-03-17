# 詳細実装計画 — React + FastAPI（初心者向け）

> このドキュメントは `implementation-plan.md` の詳細版です。
> 各フェーズで「何を」「なぜ」「どうやって」作るかを step-by-step で説明します。

---

## 現在の状態（Phase 0 完了）

```
フロントエンド (React)          バックエンド (FastAPI)
┌─────────────────────┐         ┌─────────────────────┐
│ RegisterPage        │ ──POST──▶ /api/accounts/register/
│  └ RegisterForm     │         │  └ accounts.py       │
└─────────────────────┘         │  └ models.py (User)  │
                                │  └ database.py       │
                                └─────────────────────┘
```

---

## Phase 1: ログイン / JWT 認証

### 概念説明

**JWT (JSON Web Token) とは？**
- ログイン成功後にサーバーが発行する「入場証」のようなもの
- 以降のリクエストで「私はログイン済みです」と証明するために使う
- フロントエンドがこのトークンを保存し、APIリクエストのたびにヘッダーに付ける

**認証フロー：**
```
① ユーザーがID・パスワードを送信
② サーバーが確認 → JWTトークンを返す
③ フロントエンドがトークンを localStorage に保存
④ 以降のAPIリクエスト: Authorization: Bearer <token> ヘッダーを付ける
⑤ サーバーがトークンを検証 → OKなら処理続行
```

---

### Step 1-1: バックエンド — パッケージ追加

`backend/requirements.txt` に以下の2つのパッケージを追加して `pip install -r requirements.txt` を実行する。

| パッケージ | 役割 |
|-----------|------|
| `python-jose[cryptography]` | JWTトークンの生成・検証 |
| `passlib[bcrypt]` | パスワードのハッシュ化（bcrypt） |

---

### Step 1-2: バックエンド — セキュリティユーティリティ

**新規作成: `backend/app/security.py`**

以下の内容を実装する。

- `CryptContext` を使って bcrypt スキームのハッシュ化設定を行う
- 環境変数 `SECRET_KEY` から秘密鍵を読み込む（未設定時はデフォルト値を使う）
- `ALGORITHM = "HS256"` と `ACCESS_TOKEN_EXPIRE_MINUTES = 30` を定数として定義する
- `hash_password(plain_password: str) -> str`
  - 平文パスワードを bcrypt でハッシュ化して返す
- `verify_password(plain_password: str, hashed_password: str) -> bool`
  - 平文パスワードとハッシュを照合して True/False を返す
- `create_access_token(data: dict) -> str`
  - 引数の dict を**コピーして**（元の辞書を変更しない）有効期限 `exp` を追加し、JWTとしてエンコードして返す
- `decode_token(token: str) -> dict`
  - JWTトークンを検証・デコードして dict を返す。失敗時は `JWTError` を raise する

> **注意:** `create_access_token` では `dict(data)` でコピーを作り、元の辞書を変更しないこと（イミュータブル原則）。

---

### Step 1-3: バックエンド — モデル確認

`backend/app/models.py` の `User` モデルに `hashed_password: str` フィールドが存在することを確認する。

- 平文パスワードは絶対に保存してはいけない
- `hashed_password` に `security.hash_password()` で生成した値を保存する

---

### Step 1-4: バックエンド — スキーマ追加

**`backend/app/schemas/accounts.py` に以下の3つのクラスを追記する：**

- `LoginRequest` — ログインリクエスト用
  - フィールド: `username: str`、`password: str`
- `TokenResponse` — ログイン成功時のレスポンス用
  - フィールド: `access_token: str`、`token_type: str`（デフォルト `"bearer"`）
- `MeResponse` — 現在のユーザー情報レスポンス用
  - フィールド: `id: int`、`username: str`、`email: str`

---

### Step 1-5: バックエンド — 認証依存関数

**新規作成: `backend/app/deps.py`**

以下の内容を実装する。

- `OAuth2PasswordBearer` を使って `tokenUrl="/api/accounts/login/"` を指定する
- `get_current_user(token, session)` 関数を実装する
  - `Depends(oauth2_scheme)` でリクエストヘッダーからトークンを自動取得する
  - `decode_token()` でトークンを検証し、ペイロードの `"sub"` からユーザー名を取得する
  - ユーザー名が None またはトークンが不正な場合は `HTTP 401` を raise する
  - DBからユーザーを検索し、存在しない場合も `HTTP 401` を raise する
  - 正常な場合は `User` オブジェクトを返す

> **ポイント:** `FastAPIの依存性注入 (Depends)` は「このデータを自動で用意して」という意味。エンドポイントの引数に書くだけで自動実行される。

---

### Step 1-6: バックエンド — ログインエンドポイント

**`backend/app/api/accounts.py` に以下の2つのエンドポイントを追記する：**

**POST `/api/accounts/login/`**
- `LoginRequest` を受け取る
- DBからユーザー名でユーザーを検索する
- ユーザーが存在しない、またはパスワードが不一致の場合は同じ `HTTP 401` を返す
  - （ユーザーが存在しないかパスワードが違うかを区別するエラーメッセージは出さない — セキュリティ上の注意）
- 認証成功時は `create_access_token({"sub": user.username})` でトークンを生成して `TokenResponse` を返す

**GET `/api/accounts/me/`**
- `Depends(get_current_user)` で現在のユーザーを取得する
- `MeResponse` に変換して返す

---

### Step 1-7: バックエンド — テスト作成

**新規作成: `backend/tests/test_login.py`**

以下のテストケースをすべて実装する（TDDでテストを先に書く）：

- `test_login_success` — 正しい認証情報でログインすると `access_token` と `token_type: "bearer"` が返る
- `test_login_wrong_password` — パスワードが違うと HTTP 401 が返る
- `test_login_unknown_user` — 存在しないユーザーは HTTP 401 が返る
- `test_me_with_token` — 有効なトークンで `/me/` にアクセスすると自分の情報が返る
- `test_me_without_token` — トークンなしで `/me/` にアクセスすると HTTP 401 が返る

**`backend/tests/conftest.py` に以下の fixture を追加する：**

- `registered_user` fixture — テスト用ユーザーをDBに登録する
- `auth_token` fixture — `registered_user` を使ってログインし、`access_token` 文字列を返す

---

### Step 1-8: フロントエンド — API関数

**新規作成: `frontend/src/api/auth.ts`**

以下のインターフェースと関数を実装する：

- インターフェース: `LoginRequest`（`username`, `password`）
- インターフェース: `TokenResponse`（`access_token`, `token_type`）
- インターフェース: `MeResponse`（`id`, `username`, `email`）
- `login(data: LoginRequest): Promise<TokenResponse>` — `POST /accounts/login/` を呼ぶ
- `fetchMe(): Promise<MeResponse>` — `GET /accounts/me/` を呼ぶ

---

### Step 1-9: フロントエンド — トークン管理

**新規作成: `frontend/src/api/token.ts`**

localStorage へのトークン操作を一箇所に集約する：

- `TOKEN_KEY` 定数でキー名を管理する
- `saveToken(token: string): void` — localStorage にトークンを保存する
- `getToken(): string | null` — localStorage からトークンを取得する
- `removeToken(): void` — localStorage からトークンを削除する

**`frontend/src/api/client.ts` に Axios リクエストインターセプターを追加する：**

- `apiClient.interceptors.request.use()` でリクエスト前処理を登録する
- `getToken()` でトークンを取得し、存在すれば `Authorization: Bearer <token>` ヘッダーを自動付与する
- トークンがない場合はヘッダーを付けない

---

### Step 1-10: フロントエンド — ログインページとコンポーネント

**新規作成: `frontend/src/components/LoginForm.tsx`**

以下の仕様で実装する：

- Props: `onSuccess: () => void`（ログイン成功後に呼ぶコールバック）
- state: `username`、`password`、`error`（文字列 or null）、`loading`（boolean）
- フォーム送信時: `login()` を呼び、成功時は `saveToken()` してから `onSuccess()` を実行
- エラー時は `error` state にメッセージを設定して表示する
- ローディング中はボタンを `disabled` にする

**新規作成: `frontend/src/pages/LoginPage.tsx`**

- `LoginForm` をレンダリングする
- `onSuccess` コールバックで `/tasks` へ遷移する

---

### Step 1-11: フロントエンド — React Router 導入

`npm install react-router-dom` でパッケージを追加する。

**`frontend/src/App.tsx` を以下の仕様で書き換える：**

- `BrowserRouter` でアプリ全体をラップする
- `/register` → `RegisterPage`
- `/login` → `LoginPage`
- それ以外のパス → `/login` へリダイレクト
- `PrivateRoute` コンポーネントを作る — `getToken()` がある場合は children をレンダリングし、なければ `/login` へリダイレクトする（Phase 2 以降で `/tasks` に使う）

---

### Phase 1 完了チェックリスト

- [ ] `pytest` → 全テスト PASS（登録 6 + ログイン 5 = 11以上）
- [ ] `npm test -- --run` → 全テスト PASS
- [ ] ブラウザで `http://localhost:5173/login` が表示される
- [ ] ログイン成功後にリダイレクトされる
- [ ] 開発者ツール → Application → Local Storage にトークンが保存される

---

---

## Phase 2: タスク CRUD API

### 概念説明

**CRUD とは？**
- Create（作成）, Read（読取）, Update（更新）, Delete（削除）の略
- ほぼすべてのWebアプリで使う基本パターン

**認証必須エンドポイント：**
- タスクは「自分のタスクのみ」見えるようにする
- `Depends(get_current_user)` で自動的にログイン確認

---

### Step 2-1: バックエンド — Task モデル

**`backend/app/models.py` に `Task` クラスを追記する：**

- `id: int | None` — プライマリキー、デフォルト None
- `title: str` — 最小長 1、最大長 200
- `description: str` — デフォルト空文字
- `completed: bool` — デフォルト False
- `owner_id: int` — `foreign_key="user.id"` で User テーブルを参照する
- `created_at: datetime` — `default_factory` でUTC現在時刻を設定する

> **foreign_key とは？**
> 「このフィールドは別のテーブルの ID を参照する」という意味。
> `owner_id` が `user.id` を参照することで「誰のタスクか」を紐付ける。

---

### Step 2-2: バックエンド — タスクスキーマ

**新規作成: `backend/app/schemas/tasks.py`**

以下の3つのクラスを実装する：

- `TaskCreate` — タスク作成リクエスト用
  - フィールド: `title: str`、`description: str`（デフォルト空文字）
  - `field_validator` で `title` の前後空白を除去し、空文字なら ValueError、200文字超なら ValueError を raise する
- `TaskUpdate` — タスク更新リクエスト用（すべて Optional）
  - フィールド: `title: str | None`、`description: str | None`、`completed: bool | None`
- `TaskResponse` — タスクレスポンス用
  - フィールド: `id`、`title`、`description`、`completed`、`owner_id`、`created_at`

---

### Step 2-3: バックエンド — タスクエンドポイント

**新規作成: `backend/app/api/tasks.py`**

すべてのエンドポイントで `Depends(get_current_user)` を使い、ログインユーザーのみアクセス可能にする。

- **POST `/api/tasks/`** — タスク作成
  - `TaskCreate` を受け取り、`owner_id = current_user.id` をセットして DB に保存する
  - ステータスコード 201 で `TaskResponse` を返す
- **GET `/api/tasks/`** — タスク一覧取得
  - `owner_id == current_user.id` の条件でフィルタリングして返す
- **GET `/api/tasks/{task_id}/`** — タスク単体取得
  - タスクが存在しない、または `owner_id != current_user.id` の場合は HTTP 404 を返す
- **PATCH `/api/tasks/{task_id}/`** — タスク更新
  - `TaskUpdate` を受け取り、`model_dump(exclude_none=True)` で None 以外のフィールドのみ更新する
  - 所有者チェックを行う（404）
- **DELETE `/api/tasks/{task_id}/`** — タスク削除
  - 所有者チェックを行う（404）
  - ステータスコード 204 を返す

---

### Step 2-4: バックエンド — ルーター登録

**`backend/app/main.py` を修正する：**

- `from app.api import accounts, tasks` に変更する
- `app.include_router(tasks.router, prefix="/api")` を追加する

---

### Step 2-5: バックエンド — テスト

**新規作成: `backend/tests/test_tasks.py`**

以下のテストケースをすべて実装する（TDDでテストを先に書く）：

- `auth_headers` fixture — テスト用ユーザーを登録・ログインし、`{"Authorization": "Bearer <token>"}` の dict を返す
- `test_create_task` — タスクを作成すると `title` が一致し `completed=False` で返る（201）
- `test_list_tasks` — 2件作成後に一覧取得すると2件返る（200）
- `test_update_task` — `completed: true` で PATCH すると `completed` が更新される（200）
- `test_delete_task` — 削除後に GET すると 404 が返る
- `test_cannot_access_other_users_task` — 別ユーザーのタスクに GET すると 404 が返る
- `test_create_task_without_auth` — 未認証で POST すると 401 が返る

---

### Step 2-6: フロントエンド — タスクAPI

**新規作成: `frontend/src/api/tasks.ts`**

以下のインターフェースと関数を実装する：

- インターフェース: `Task`（`id`, `title`, `description`, `completed`, `owner_id`, `created_at`）
- インターフェース: `TaskCreate`（`title`, `description?`）
- インターフェース: `TaskUpdate`（`title?`, `description?`, `completed?`）
- `fetchTasks(): Promise<Task[]>` — `GET /tasks/` を呼ぶ
- `createTask(data: TaskCreate): Promise<Task>` — `POST /tasks/` を呼ぶ
- `updateTask(id: number, data: TaskUpdate): Promise<Task>` — `PATCH /tasks/{id}/` を呼ぶ
- `deleteTask(id: number): Promise<void>` — `DELETE /tasks/{id}/` を呼ぶ

---

### Step 2-7: フロントエンド — タスク一覧ページ

**新規作成: `frontend/src/pages/TasksPage.tsx`**

以下の仕様で実装する：

- state: `tasks: Task[]`、`newTitle: string`、`error: string | null`
- `useEffect` でページ表示時に `fetchTasks()` を呼び、取得したタスクを state にセットする
- フォーム送信で `createTask()` を呼び、成功したら **新しい配列** を作って state を更新する（`setTasks(prev => [...prev, created])`）
- チェックボックスクリックで `updateTask()` を呼び、成功したら `prev.map()` で対象タスクだけ置き換える
- 削除ボタンクリックで `deleteTask()` を呼び、成功したら `prev.filter()` で対象タスクを除外する
- ログアウトボタンで `removeToken()` を呼び、`/login` へ遷移する
- エラー発生時は `error` state にメッセージをセットして表示する

**`frontend/src/App.tsx` を修正する：**

- `TasksPage` をインポートして `/tasks` ルートを追加する
- `/tasks` は `PrivateRoute` でラップする（未ログイン時は `/login` へリダイレクト）

---

### Phase 2 完了チェックリスト

- [ ] `pytest` → 全テスト PASS
- [ ] Swagger UI (`http://localhost:8000/docs`) でタスクAPIを手動テスト
- [ ] フロントエンドでタスクの追加・完了・削除が動く
- [ ] ログアウトするとログインページに戻る

---

---

## Phase 3: UI 改善

### Step 3-1: フィルタリング機能

**`frontend/src/pages/TasksPage.tsx` にフィルター機能を追加する：**

- `Filter` 型を定義する（`'all' | 'active' | 'completed'`）
- `filter: Filter` の state を追加し、デフォルトは `'all'`
- `filteredTasks` を `tasks.filter()` で導出する変数として定義する
  - `'active'` のとき: `completed === false` のタスクのみ
  - `'completed'` のとき: `completed === true` のタスクのみ
  - `'all'` のとき: すべてのタスク
- 「すべて」「未完了」「完了済み」の3つのボタンを追加し、クリックで `filter` state を更新する
- `tasks.map()` を `filteredTasks.map()` に変更する

---

### Step 3-2: ソート機能

**`frontend/src/pages/TasksPage.tsx` にソート機能を追加する：**

- `SortKey` 型を定義する（`'created_at' | 'title'`）
- `sortKey: SortKey` の state を追加し、デフォルトは `'created_at'`
- `sortedTasks` を `filteredTasks` をスプレッドしてから `sort()` した変数として定義する
  - `title` ソート時: `localeCompare` で日本語対応のアルファベット順
  - `created_at` ソート時: `Date` に変換して時系列順
- 「作成日順」「タイトル順」のボタンを追加し、クリックで `sortKey` state を更新する
- `filteredTasks.map()` を `sortedTasks.map()` に変更する

---

### Phase 3 完了チェックリスト

- [ ] フィルターで未完了/完了済みを切り替えられる
- [ ] タイトル順・作成日順のソートが動く
- [ ] ページ遷移（登録→ログイン→タスク一覧）がスムーズ

---

---

## Phase 4: テスト強化 + デプロイ

### Step 4-1: バックエンド カバレッジ確認

`requirements.txt` に `pytest-cov` を追加してインストールし、`pytest --cov=app --cov-report=html` を実行する。

生成された `htmlcov/index.html` をブラウザで開き、80%以上のカバレッジを確認する。

### Step 4-2: フロントエンド カバレッジ確認

`npm run test:coverage` を実行する。

生成された `coverage/index.html` をブラウザで確認し、80%以上のカバレッジを確認する。

### Step 4-3: Docker Compose

**新規作成: `docker-compose.yml`**（ルートディレクトリ）

以下の2つのサービスを定義する：

- `backend` サービス
  - `./backend` を build context とする
  - ポート `8000:8000` を公開する
  - 環境変数 `SECRET_KEY` を設定する（本番値に変更すること）
- `frontend` サービス
  - `./frontend` を build context とする
  - ポート `5173:80` を公開する
  - `depends_on: backend` を設定する

---

## まとめ：ファイル追加一覧

```
Phase 1:
  backend/app/security.py          ← JWT・パスワードユーティリティ
  backend/app/deps.py              ← 認証依存関数
  backend/app/schemas/accounts.py  ← LoginRequest, TokenResponse, MeResponse 追加
  backend/app/api/accounts.py      ← /login/, /me/ 追加
  backend/tests/test_login.py      ← ログインテスト
  frontend/src/api/auth.ts         ← login(), fetchMe() API関数
  frontend/src/api/token.ts        ← localStorage トークン管理
  frontend/src/api/client.ts       ← インターセプター追加
  frontend/src/components/LoginForm.tsx
  frontend/src/pages/LoginPage.tsx
  frontend/src/App.tsx             ← React Router 追加

Phase 2:
  backend/app/models.py            ← Task モデル追加
  backend/app/schemas/tasks.py     ← タスクスキーマ
  backend/app/api/tasks.py         ← タスク CRUD エンドポイント
  backend/app/main.py              ← tasks ルーター登録
  backend/tests/test_tasks.py      ← タスクテスト
  frontend/src/api/tasks.ts        ← タスク API 関数
  frontend/src/pages/TasksPage.tsx ← タスク一覧ページ

Phase 3:
  frontend/src/pages/TasksPage.tsx ← フィルター・ソート機能追加
```
