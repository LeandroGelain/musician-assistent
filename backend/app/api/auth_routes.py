from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.security import create_access_token
from app.db import get_db
from app.models.user import User
from app.schemas.auth import LoginInput, RegisterInput
from app.schemas.user import UserOutput
from app.services.auth_service import login_user, register_user

router = APIRouter(prefix='/api/auth', tags=['auth'])


@router.post('/register', response_model=UserOutput)
def register(payload: RegisterInput, response: Response, db: Session = Depends(get_db)):
    user = register_user(db, payload)
    token = create_access_token(str(user.id))
    settings = get_settings()
    response.set_cookie(
        key='access_token',
        value=token,
        httponly=True,
        secure=False,
        samesite='lax',
        max_age=settings.access_token_expire_minutes * 60,
    )
    return user


@router.post('/login', response_model=UserOutput)
def login(payload: LoginInput, response: Response, db: Session = Depends(get_db)):
    user = login_user(db, payload)
    token = create_access_token(str(user.id))
    settings = get_settings()
    response.set_cookie(
        key='access_token',
        value=token,
        httponly=True,
        secure=False,
        samesite='lax',
        max_age=settings.access_token_expire_minutes * 60,
    )
    return user


@router.get('/me', response_model=UserOutput)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post('/logout', status_code=204)
def logout(response: Response):
    response.delete_cookie('access_token')
    return None
