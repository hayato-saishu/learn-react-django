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
    # Check duplicate username
    existing_username = session.exec(
        select(User).where(User.username == body.username)
    ).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"username": ["A user with that username already exists."]},
        )

    # Check duplicate email
    existing_email = session.exec(
        select(User).where(User.email == body.email)
    ).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"email": ["A user with that email already exists."]},
        )

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    return RegisterResponse(id=user.id, username=user.username, email=user.email)
