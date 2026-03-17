# React フロントエンド解説

## 概要

React 19 + TypeScript + Vite によるフロントエンド。コンポーネントベースの UI 設計で、Axios を通じて FastAPI バックエンドと通信する。

---

## ディレクトリ構成

```
frontend/src/
├── main.tsx               # エントリーポイント（DOM にマウント）
├── App.tsx                # ルートコンポーネント
├── api/
│   └── client.ts          # Axios インスタンス（ベース URL 設定済み）
├── pages/
│   └── RegisterPage.tsx   # 登録ページ（レイアウト担当）
├── components/
│   └── RegisterForm.tsx   # 登録フォーム（ロジック担当）
└── __tests__/
    └── RegisterForm.test.tsx  # Vitest + React Testing Library テスト
```

---

## 主要ライブラリ

| ライブラリ | 役割 |
|-----------|------|
| React 19 | UI コンポーネントフレームワーク |
| TypeScript | 型安全な JavaScript |
| Vite | 開発サーバー・バンドラー（高速 HMR）|
| Axios | HTTP クライアント（API 通信）|
| Vitest | テストランナー（Vite と統合）|
| React Testing Library | DOM ベースのコンポーネントテスト |

---

## 各ファイルの役割

### `main.tsx`

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- `createRoot`: React 18+ の新しいレンダリング API
- `StrictMode`: 開発時に副作用の二重実行や非推奨 API の警告を出す
- `rootElement` が存在しない場合は即 throw（早期エラー検出）

### `App.tsx`

```tsx
export default function App() {
  return <RegisterPage />
}
```

- 現時点ではルーティングなし。Phase 3 で React Router を導入予定
- ページコンポーネントをラップするシェル役

### `api/client.ts`

```ts
const apiClient = axios.create({
  baseURL: 'http://localhost:8000/api',
  headers: { 'Content-Type': 'application/json' },
})
```

- `axios.create()` で設定済みインスタンスを生成 → 各所で import して使い回す
- ベース URL を一箇所で管理 → 変更が容易

### `pages/RegisterPage.tsx`

- レイアウトと見出しのみ担当
- フォームロジックは `RegisterForm` に委譲（責務の分離）

### `components/RegisterForm.tsx`

フォームの状態管理・バリデーション・API 通信をすべて担当。

#### 状態管理

```tsx
const [formData, setFormData] = useState<FormState>(initialFormState)
const [errors, setErrors] = useState<FormErrors>({})
const [successMessage, setSuccessMessage] = useState('')
const [isSubmitting, setIsSubmitting] = useState(false)
```

| state | 型 | 役割 |
|-------|----|------|
| `formData` | `FormState` | 各入力フィールドの値 |
| `errors` | `FormErrors` | フィールドごとのエラーメッセージ |
| `successMessage` | `string` | 登録成功時のメッセージ |
| `isSubmitting` | `boolean` | 送信中フラグ（ボタン無効化に使用）|

#### イミュータブルな状態更新

```tsx
// prev を受け取り、新しいオブジェクトを返す（元のオブジェクトを変更しない）
setFormData((prev) => ({ ...prev, [name]: value }))
```

- スプレッド構文 `...prev` で既存の値をコピー
- `[name]: value` でフィールド名をキーとして動的に上書き

#### クライアントサイドバリデーション

```tsx
const validate = (): FormErrors => {
  const newErrors: FormErrors = {}
  if (!formData.username) newErrors.username = 'ユーザー名は必須です'
  // ...
  if (formData.password !== formData.passwordConfirm) {
    newErrors.passwordConfirm = 'パスワードが一致しません'
  }
  return newErrors
}
```

- API を呼ぶ前にフロントで検証 → 無駄なリクエストを防ぐ
- エラーがあれば `setErrors()` にセットしてフォームに表示

#### API 通信と非同期処理

```tsx
const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault()          // ブラウザのデフォルト送信を防ぐ
  // ...バリデーション...
  setIsSubmitting(true)
  try {
    const response = await apiClient.post('/accounts/register/', { ... })
    setSuccessMessage(response.data.message)
    setFormData(initialFormState)  // フォームをリセット
  } catch (err) {
    // サーバーエラーをフィールドに表示
  } finally {
    setIsSubmitting(false)    // 成否に関わらず送信中フラグを解除
  }
}
```

#### サーバーエラーのハンドリング

```tsx
for (const [key, messages] of Object.entries(error.response.data)) {
  serverErrors[key] = Array.isArray(messages) ? messages[0] : messages
}
```

- FastAPI が返すエラー形式（`{ "username": ["このユーザー名は..."] }`）に対応
- フィールド名をキーにして `errors` state にセット → 該当フィールドの下にエラーを表示

#### アクセシビリティ

- `aria-describedby`: エラー段落の ID を input に関連付け（スクリーンリーダー対応）
- `role="alert"`: エラーメッセージの動的な読み上げ

---

## テストの仕組み

```tsx
// APIクライアントをモック化
vi.mock('../api/client')

// 成功ケース
apiClient.post = vi.fn().mockResolvedValue({ data: { message: '登録が完了しました' } })

// エラーケース
apiClient.post = vi.fn().mockRejectedValue({
  response: { data: { username: ['このユーザー名は既に使用されています。'] } },
})
```

- `vi.mock()` で Axios の実際の HTTP 通信をモック → ネットワーク不要でテスト
- `@testing-library/user-event` で実際のユーザー操作（タイプ・クリック）をシミュレート
- `screen.getByLabelText()` で `<label>` と `<input>` の関連付けを検証

---

## データフロー

```
ユーザー入力
    ↓
handleChange → setFormData（イミュータブル更新）
    ↓
handleSubmit → validate()
    ↓ OK
apiClient.post('/accounts/register/')
    ↓ 成功
setSuccessMessage → フォームを成功画面に切り替え
    ↓ 失敗
setErrors → フィールドにエラーを表示
```

---

## 開発サーバーの起動

```bash
cd frontend
npm run dev   # http://localhost:5173
```

- Vite の HMR（Hot Module Replacement）により、ファイル保存時にブラウザが即時反映
