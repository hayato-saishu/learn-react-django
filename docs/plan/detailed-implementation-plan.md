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

```bash
cd backend
venv/Scripts/activate
pip install python-jose[cryptography] passlib[bcrypt]
pip freeze > requirements.txt
```

| パッケージ | 役割 |
|-----------|------|
| `python-jose` | JWTトークンの生成・検証 |
| `passlib` | パスワードのハッシュ化（bcrypt） |

---

### Step 1-2: バックエンド — セキュリティユーティリティ

**新規作成: `backend/app/security.py`**

```python
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

# パスワードハッシュ化の設定
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT設定（本番では環境変数から読む）
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


def hash_password(plain_password: str) -> str:
    """パスワードをbcryptでハッシュ化する"""
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """入力パスワードとハッシュを照合する"""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict) -> str:
    """JWTトークンを生成する"""
    payload = dict(data)  # コピーして元を変えない（イミュータブルの原則）
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload["exp"] = expire
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """JWTトークンを検証・デコードする。失敗時は JWTError を raise する"""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
```

> **なぜ `dict(data)` でコピーするの？**
> 元の辞書を直接変更すると呼び出し元のデータが変わってしまうため。
> 新しいオブジェクトを作ることで副作用を防ぐ（コーディングスタイルのイミュータブル原則）。

---

### Step 1-3: バックエンド — モデル修正

**`backend/app/models.py` に `hashed_password` フィールドを確認**

```python
from __future__ import annotations
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    email: str = Field(index=True, unique=True)
    hashed_password: str   # ← 平文パスワードは絶対に保存しない！
```

---

### Step 1-4: バックエンド — スキーマ追加

**`backend/app/schemas/accounts.py` に追記：**

```python
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    id: int
    username: str
    email: str
```

---

### Step 1-5: バックエンド — 認証依存関数

**新規作成: `backend/app/deps.py`**

```python
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlmodel import Session, select

from app.database import get_session
from app.models import User
from app.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/accounts/login/")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    """
    リクエストの Authorization ヘッダーからユーザーを取得する。
    Depends() = FastAPIの依存性注入。「このデータを自動で用意して」という意味。
    """
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="認証情報が無効です",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        username: str | None = payload.get("sub")
        if username is None:
            raise credentials_error
    except JWTError:
        raise credentials_error

    user = session.exec(select(User).where(User.username == username)).first()
    if user is None:
        raise credentials_error
    return user
```

---

### Step 1-6: バックエンド — ログインエンドポイント

**`backend/app/api/accounts.py` に追記：**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_user
from app.models import User
from app.schemas.accounts import (
    LoginRequest, MeResponse, RegisterRequest, RegisterResponse, TokenResponse
)
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/accounts", tags=["accounts"])


# 既存: POST /api/accounts/register/
@router.post("/register/", response_model=RegisterResponse, status_code=201)
def register(req: RegisterRequest, session: Session = Depends(get_session)):
    # ... 既存の実装 ...


# 新規: POST /api/accounts/login/
@router.post("/login/", response_model=TokenResponse)
def login(req: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == req.username)).first()

    # ユーザーが存在しない or パスワード不一致 → 同じエラーを返す（セキュリティ上の注意）
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ユーザー名またはパスワードが違います",
        )

    token = create_access_token({"sub": user.username})
    return TokenResponse(access_token=token)


# 新規: GET /api/accounts/me/
@router.get("/me/", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user)):
    return MeResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
    )
```

---

### Step 1-7: バックエンド — テスト作成

**新規作成: `backend/tests/test_login.py`**

```python
"""Phase 1: ログイン・JWT認証のテスト"""
import pytest
from fastapi.testclient import TestClient


def test_login_success(client: TestClient, registered_user):
    """正しい認証情報でログインするとトークンが返る"""
    response = client.post("/api/accounts/login/", json={
        "username": "testuser",
        "password": "testpass123",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client: TestClient, registered_user):
    """パスワードが違うと 401 が返る"""
    response = client.post("/api/accounts/login/", json={
        "username": "testuser",
        "password": "wrongpassword",
    })
    assert response.status_code == 401


def test_login_unknown_user(client: TestClient):
    """存在しないユーザーは 401 が返る"""
    response = client.post("/api/accounts/login/", json={
        "username": "nobody",
        "password": "somepassword",
    })
    assert response.status_code == 401


def test_me_with_token(client: TestClient, registered_user, auth_token):
    """有効なトークンで /me/ にアクセスできる"""
    response = client.get(
        "/api/accounts/me/",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 200
    assert response.json()["username"] == "testuser"


def test_me_without_token(client: TestClient):
    """トークンなしで /me/ にアクセスすると 401"""
    response = client.get("/api/accounts/me/")
    assert response.status_code == 401
```

**`backend/tests/conftest.py` に fixture を追加：**

```python
@pytest.fixture
def registered_user(client: TestClient):
    """テスト用ユーザーを事前に登録する"""
    client.post("/api/accounts/register/", json={
        "username": "testuser",
        "email": "test@example.com",
        "password": "testpass123",
    })


@pytest.fixture
def auth_token(client: TestClient, registered_user):
    """登録済みユーザーのJWTトークンを返す"""
    response = client.post("/api/accounts/login/", json={
        "username": "testuser",
        "password": "testpass123",
    })
    return response.json()["access_token"]
```

---

### Step 1-8: フロントエンド — API関数

**新規作成: `frontend/src/api/auth.ts`**

```typescript
import apiClient from './client'

export interface LoginRequest {
  username: string
  password: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface MeResponse {
  id: number
  username: string
  email: string
}

export async function login(data: LoginRequest): Promise<TokenResponse> {
  const response = await apiClient.post<TokenResponse>('/accounts/login/', data)
  return response.data
}

export async function fetchMe(): Promise<MeResponse> {
  const response = await apiClient.get<MeResponse>('/accounts/me/')
  return response.data
}
```

---

### Step 1-9: フロントエンド — トークン管理

**新規作成: `frontend/src/api/token.ts`**

```typescript
const TOKEN_KEY = 'access_token'

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}
```

**`frontend/src/api/client.ts` を修正（自動でトークンをヘッダーに付ける）：**

```typescript
import axios from 'axios'
import { getToken } from './token'

const apiClient = axios.create({
  baseURL: 'http://localhost:8000/api',
  headers: { 'Content-Type': 'application/json' },
})

// リクエストインターセプター: 毎回自動でトークンを付ける
apiClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default apiClient
```

---

### Step 1-10: フロントエンド — ログインページとコンポーネント

**新規作成: `frontend/src/components/LoginForm.tsx`**

```tsx
import { useState } from 'react'
import { login } from '../api/auth'
import { saveToken } from '../api/token'

interface Props {
  onSuccess: () => void
}

export default function LoginForm({ onSuccess }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const token = await login({ username, password })
      saveToken(token.access_token)
      onSuccess()
    } catch {
      setError('ユーザー名またはパスワードが違います')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>ログイン</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <div>
        <label>ユーザー名</label>
        <input value={username} onChange={e => setUsername(e.target.value)} required />
      </div>
      <div>
        <label>パスワード</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
      </div>
      <button type="submit" disabled={loading}>
        {loading ? 'ログイン中...' : 'ログイン'}
      </button>
    </form>
  )
}
```

**新規作成: `frontend/src/pages/LoginPage.tsx`**

```tsx
import { useNavigate } from 'react-router-dom'
import LoginForm from '../components/LoginForm'

export default function LoginPage() {
  const navigate = useNavigate()
  return <LoginForm onSuccess={() => navigate('/tasks')} />
}
```

---

### Step 1-11: フロントエンド — React Router 導入

```bash
cd frontend
npm install react-router-dom
```

**`frontend/src/App.tsx` を修正：**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { getToken } from './api/token'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return getToken() ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        {/* Phase 2 以降に追加: <Route path="/tasks" element={<PrivateRoute><TasksPage /></PrivateRoute>} /> */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
```

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

**`backend/app/models.py` に追記：**

```python
from __future__ import annotations
from datetime import datetime, timezone
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    email: str = Field(index=True, unique=True)
    hashed_password: str


class Task(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="")
    completed: bool = Field(default=False)
    owner_id: int = Field(foreign_key="user.id")  # User テーブルを参照
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

> **foreign_key とは？**
> 「このフィールドは別のテーブルの ID を参照する」という意味。
> `owner_id` が `user.id` を参照することで「誰のタスクか」を紐付ける。

---

### Step 2-2: バックエンド — タスクスキーマ

**新規作成: `backend/app/schemas/tasks.py`**

```python
from datetime import datetime
from pydantic import BaseModel, field_validator


class TaskCreate(BaseModel):
    title: str
    description: str = ""

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("タイトルは必須です")
        if len(v) > 200:
            raise ValueError("タイトルは200文字以内にしてください")
        return v


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    completed: bool | None = None


class TaskResponse(BaseModel):
    id: int
    title: str
    description: str
    completed: bool
    owner_id: int
    created_at: datetime
```

---

### Step 2-3: バックエンド — タスクエンドポイント

**新規作成: `backend/app/api/tasks.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_user
from app.models import Task, User
from app.schemas.tasks import TaskCreate, TaskResponse, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("/", response_model=TaskResponse, status_code=201)
def create_task(
    req: TaskCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    task = Task(
        title=req.title,
        description=req.description,
        owner_id=current_user.id,
    )
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.get("/", response_model=list[TaskResponse])
def list_tasks(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    tasks = session.exec(
        select(Task).where(Task.owner_id == current_user.id)
    ).all()
    return tasks


@router.get("/{task_id}/", response_model=TaskResponse)
def get_task(
    task_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    task = session.get(Task, task_id)
    if not task or task.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="タスクが見つかりません")
    return task


@router.patch("/{task_id}/", response_model=TaskResponse)
def update_task(
    task_id: int,
    req: TaskUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    task = session.get(Task, task_id)
    if not task or task.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="タスクが見つかりません")

    # None でないフィールドだけ更新
    update_data = req.model_dump(exclude_none=True)
    for key, value in update_data.items():
        setattr(task, key, value)

    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.delete("/{task_id}/", status_code=204)
def delete_task(
    task_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    task = session.get(Task, task_id)
    if not task or task.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="タスクが見つかりません")
    session.delete(task)
    session.commit()
```

---

### Step 2-4: バックエンド — ルーター登録

**`backend/app/main.py` に追記：**

```python
from app.api import accounts, tasks   # tasks を追加

app.include_router(accounts.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")    # ← 追加
```

---

### Step 2-5: バックエンド — テスト

**新規作成: `backend/tests/test_tasks.py`**

```python
"""Phase 2: タスク CRUD のテスト"""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def auth_headers(client: TestClient):
    """認証済みヘッダーを返す"""
    client.post("/api/accounts/register/", json={
        "username": "taskuser", "email": "task@example.com", "password": "password123"
    })
    response = client.post("/api/accounts/login/", json={
        "username": "taskuser", "password": "password123"
    })
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_task(client: TestClient, auth_headers):
    response = client.post("/api/tasks/", json={"title": "買い物"}, headers=auth_headers)
    assert response.status_code == 201
    assert response.json()["title"] == "買い物"
    assert response.json()["completed"] is False


def test_list_tasks(client: TestClient, auth_headers):
    client.post("/api/tasks/", json={"title": "タスク1"}, headers=auth_headers)
    client.post("/api/tasks/", json={"title": "タスク2"}, headers=auth_headers)
    response = client.get("/api/tasks/", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_update_task(client: TestClient, auth_headers):
    created = client.post("/api/tasks/", json={"title": "元のタイトル"}, headers=auth_headers)
    task_id = created.json()["id"]
    response = client.patch(
        f"/api/tasks/{task_id}/",
        json={"completed": True},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["completed"] is True


def test_delete_task(client: TestClient, auth_headers):
    created = client.post("/api/tasks/", json={"title": "削除するタスク"}, headers=auth_headers)
    task_id = created.json()["id"]
    client.delete(f"/api/tasks/{task_id}/", headers=auth_headers)
    response = client.get(f"/api/tasks/{task_id}/", headers=auth_headers)
    assert response.status_code == 404


def test_cannot_access_other_users_task(client: TestClient, auth_headers):
    """他のユーザーのタスクは見えない"""
    # 別ユーザーを作ってタスクを作る
    client.post("/api/accounts/register/", json={
        "username": "other", "email": "other@example.com", "password": "password123"
    })
    other_login = client.post("/api/accounts/login/", json={
        "username": "other", "password": "password123"
    })
    other_headers = {"Authorization": f"Bearer {other_login.json()['access_token']}"}
    created = client.post("/api/tasks/", json={"title": "他人のタスク"}, headers=other_headers)
    task_id = created.json()["id"]

    # 最初のユーザーからアクセス → 404
    response = client.get(f"/api/tasks/{task_id}/", headers=auth_headers)
    assert response.status_code == 404


def test_create_task_without_auth(client: TestClient):
    """未認証でタスク作成 → 401"""
    response = client.post("/api/tasks/", json={"title": "テスト"})
    assert response.status_code == 401
```

---

### Step 2-6: フロントエンド — タスクAPI

**新規作成: `frontend/src/api/tasks.ts`**

```typescript
import apiClient from './client'

export interface Task {
  id: number
  title: string
  description: string
  completed: boolean
  owner_id: number
  created_at: string
}

export interface TaskCreate {
  title: string
  description?: string
}

export interface TaskUpdate {
  title?: string
  description?: string
  completed?: boolean
}

export async function fetchTasks(): Promise<Task[]> {
  const res = await apiClient.get<Task[]>('/tasks/')
  return res.data
}

export async function createTask(data: TaskCreate): Promise<Task> {
  const res = await apiClient.post<Task>('/tasks/', data)
  return res.data
}

export async function updateTask(id: number, data: TaskUpdate): Promise<Task> {
  const res = await apiClient.patch<Task>(`/tasks/${id}/`, data)
  return res.data
}

export async function deleteTask(id: number): Promise<void> {
  await apiClient.delete(`/tasks/${id}/`)
}
```

---

### Step 2-7: フロントエンド — タスク一覧ページ

**新規作成: `frontend/src/pages/TasksPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { fetchTasks, createTask, updateTask, deleteTask, Task } from '../api/tasks'
import { removeToken } from '../api/token'
import { useNavigate } from 'react-router-dom'

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  // ページ表示時にタスク一覧を取得
  useEffect(() => {
    fetchTasks()
      .then(setTasks)
      .catch(() => setError('タスクの取得に失敗しました'))
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    try {
      const created = await createTask({ title: newTitle })
      setTasks(prev => [...prev, created])  // 新しい配列を作る（イミュータブル）
      setNewTitle('')
    } catch {
      setError('タスクの作成に失敗しました')
    }
  }

  async function handleToggle(task: Task) {
    try {
      const updated = await updateTask(task.id, { completed: !task.completed })
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
    } catch {
      setError('更新に失敗しました')
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteTask(id)
      setTasks(prev => prev.filter(t => t.id !== id))
    } catch {
      setError('削除に失敗しました')
    }
  }

  function handleLogout() {
    removeToken()
    navigate('/login')
  }

  return (
    <div>
      <h1>タスク一覧</h1>
      <button onClick={handleLogout}>ログアウト</button>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={handleCreate}>
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="新しいタスクを入力"
        />
        <button type="submit">追加</button>
      </form>

      <ul>
        {tasks.map(task => (
          <li key={task.id}>
            <input
              type="checkbox"
              checked={task.completed}
              onChange={() => handleToggle(task)}
            />
            <span style={{ textDecoration: task.completed ? 'line-through' : 'none' }}>
              {task.title}
            </span>
            <button onClick={() => handleDelete(task.id)}>削除</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

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

**`frontend/src/pages/TasksPage.tsx` にフィルター追加：**

```tsx
type Filter = 'all' | 'active' | 'completed'

// コンポーネント内に追加
const [filter, setFilter] = useState<Filter>('all')

const filteredTasks = tasks.filter(task => {
  if (filter === 'active') return !task.completed
  if (filter === 'completed') return task.completed
  return true
})

// JSX にフィルターボタンを追加
<div>
  <button onClick={() => setFilter('all')}>すべて</button>
  <button onClick={() => setFilter('active')}>未完了</button>
  <button onClick={() => setFilter('completed')}>完了済み</button>
</div>

// tasks.map → filteredTasks.map に変更
```

---

### Step 3-2: ソート機能

```tsx
type SortKey = 'created_at' | 'title'

const [sortKey, setSortKey] = useState<SortKey>('created_at')

const sortedTasks = [...filteredTasks].sort((a, b) => {
  if (sortKey === 'title') return a.title.localeCompare(b.title)
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
})
```

---

### Phase 3 完了チェックリスト

- [ ] フィルターで未完了/完了済みを切り替えられる
- [ ] タイトル順・作成日順のソートが動く
- [ ] ページ遷移（登録→ログイン→タスク一覧）がスムーズ

---

---

## Phase 4: テスト強化 + デプロイ

### Step 4-1: バックエンド カバレッジ確認

```bash
pip install pytest-cov
pytest --cov=app --cov-report=html
# htmlcov/index.html をブラウザで開いて確認
```

### Step 4-2: フロントエンド カバレッジ確認

```bash
npm run test:coverage
# coverage/index.html をブラウザで確認
```

### Step 4-3: Docker Compose

**新規作成: `docker-compose.yml`**（ルートディレクトリ）

```yaml
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - SECRET_KEY=change-this-in-production

  frontend:
    build: ./frontend
    ports:
      - "5173:80"
    depends_on:
      - backend
```

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
