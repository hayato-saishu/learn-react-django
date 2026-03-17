from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.models import User
from app.schemas.accounts import RegisterRequest, RegisterResponse, TokenResponse, LoginRequest, UserDetailResponse
from app.security import create_access_token, verify_password, hash_password, pwd_context
from app.deps import get_current_user
from passlib.context import CryptContext

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.post(
    "/register/",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(request_body: RegisterRequest, session: Session = Depends(get_session)):
    # Check duplicate username
    existing_username = session.exec(
        select(User).where(User.username == request_body.username)
    ).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"username": ["A user with that username already exists."]},
        )

    # Check duplicate email
    existing_email = session.exec(
        select(User).where(User.email == request_body.email)
    ).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"email": ["A user with that email already exists."]},
        )

    # Create user
    user = User(
        username=request_body.username,
        email=request_body.email,
        hashed_password=hash_password(request_body.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    return RegisterResponse(id=user.id, username=user.username, email=user.email)

@router.post("/login/", response_model=TokenResponse)
def login(request_body: LoginRequest, session: Session = Depends(get_session)):
    # Check duplicate username
    user = session.exec(
        select(User).where(User.username == request_body.username)
    ).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"username": ["Invalid credentials Incorrect username or password."]},
        )
    if not verify_password(request_body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"password": ["Invalid credentials Incorrect username or password."]},
        )
    return TokenResponse(access_token=create_access_token({"sub": user.username}))


@router.get("/user/", response_model=UserDetailResponse)
def get_user_detail(current_user: User = Depends(get_current_user)):
    return UserDetailResponse(id=current_user.id, username=current_user.username, email=current_user.email)