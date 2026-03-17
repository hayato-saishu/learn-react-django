from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlmodel import Session, select

from app.database import get_session
from app.models import User
from app.security import decode_token

# tokenUrl はログインエンドポイントのパス（Swagger UI の認証ボタンに使われる）
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/accounts/login/")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    """
    リクエストの Authorization ヘッダーからトークンを取り出し、
    対応するユーザーを返す依存関数。

    Depends() = FastAPI の依存性注入。
    「このデータを自動で用意してからエンドポイントを呼んで」という仕組み。
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
