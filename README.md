# learn-react-django

ReactとDjangoの勉強用シンプルなTodoアプリです。

## 構成

- **backend/**: Django REST Framework を使ったAPIサーバー
- **frontend/**: Vite + React を使ったフロントエンド

## セットアップ

### バックエンド (Django)

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

APIサーバーが `http://localhost:8000` で起動します。

### フロントエンド (React)

```bash
cd frontend
npm install
npm run dev
```

開発サーバーが `http://localhost:5173` で起動します。

## 機能

- Todoの一覧表示
- Todoの追加
- Todoの完了/未完了の切り替え
- Todoの削除

## テスト

### バックエンドのテスト

```bash
cd backend
python manage.py test todos
```
