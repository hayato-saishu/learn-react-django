from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from jose import JWTError, jwt
from passlib.context import CryptContext

load_dotenv()

# パスワードハッシュ化の設定（bcrypt を使用）
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT設定（環境変数 SECRET_KEY が必須。未設定の場合は起動時にエラーで停止する）
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("環境変数 SECRET_KEY が設定されていません。.env ファイルまたはシステム環境変数に設定してください。")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


def hash_password(plain_password: str) -> str:
    """パスワードを bcrypt でハッシュ化する"""
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """入力パスワードとハッシュを照合する"""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict) -> str:
    """JWT アクセストークンを生成する"""
    # 元の辞書を変更しないようコピーする（イミュータブル原則）
    payload = dict(data)
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload["exp"] = expire
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """JWT トークンを検証・デコードする。失敗時は JWTError を raise する"""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
