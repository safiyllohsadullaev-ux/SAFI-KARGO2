from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Branch, User
from app.security import (
    create_access_token,
    get_current_user,
    hash_password,
    normalize_phone,
    verify_password,
)
from app.services import allocate, allow, badges, branch_out, consume_otp, request_otp, user_out

router = APIRouter(prefix="/api/auth", tags=["auth"])


class OtpIn(BaseModel):
    phone: str
    purpose: str


class RegisterIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    phone: str
    password: str = Field(min_length=8, max_length=128)
    password_confirm: str
    branch_id: int | None = None
    otp: str


class LoginIn(BaseModel):
    phone: str
    password: str


class ResetIn(BaseModel):
    phone: str
    otp: str
    new_password: str = Field(min_length=8, max_length=128)


class ProfileIn(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    language: str | None = None


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "local"


@router.post("/otp")
def otp(payload: OtpIn, request: Request, db: Session = Depends(get_db)):
    allow(f"otp-ip:{client_ip(request)}", 10, 600)
    result = request_otp(db, payload.phone, payload.purpose)
    db.commit()
    return result


@router.post("/register")
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    if payload.password != payload.password_confirm:
        raise HTTPException(status_code=400, detail="password_mismatch")
    phone = normalize_phone(payload.phone)
    consume_otp(db, phone, "register", payload.otp)
    if db.query(User).filter(User.phone == phone).first():
        raise HTTPException(status_code=409, detail="phone_taken")
    branch_id = None
    if payload.branch_id is not None:
        branch = db.get(Branch, payload.branch_id)
        if branch is None or not branch.is_active:
            raise HTTPException(status_code=400, detail="branch_invalid")
        branch_id = branch.id
    user = User(
        public_client_id=allocate(db, "client", "SAFI", 6),
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        phone=phone,
        password_hash=hash_password(payload.password),
        branch_id=branch_id,
        role="client",
        language="tj",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"access_token": create_access_token(user), "user": user_out(user)}


@router.post("/login")
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    allow(f"login:{client_ip(request)}", 8, 900)
    phone = normalize_phone(payload.phone)
    user = db.query(User).filter(User.phone == phone).one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="invalid_credentials")
    if user.is_blocked:
        raise HTTPException(status_code=403, detail="user_blocked")
    return {"access_token": create_access_token(user), "user": user_out(user), "badges": badges(db, user)}


@router.post("/reset")
def reset_password(payload: ResetIn, db: Session = Depends(get_db)):
    phone = normalize_phone(payload.phone)
    consume_otp(db, phone, "reset", payload.otp)
    user = db.query(User).filter(User.phone == phone).one_or_none()
    if user is None:
        raise HTTPException(status_code=400, detail="otp_invalid")
    user.password_hash = hash_password(payload.new_password)
    user.session_version += 1
    db.commit()
    return {"ok": True}


@router.post("/logout")
def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.session_version += 1
    db.commit()
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    branch = db.get(Branch, user.branch_id) if user.branch_id else None
    return {"user": user_out(user), "branch": branch_out(branch), "badges": badges(db, user)}


@router.patch("/me")
def update_me(payload: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.first_name is not None:
        user.first_name = payload.first_name.strip() or user.first_name
    if payload.last_name is not None:
        user.last_name = payload.last_name.strip() or user.last_name
    if payload.language is not None:
        if payload.language not in ("tj", "ru", "en"):
            raise HTTPException(status_code=400, detail="language_invalid")
        user.language = payload.language
    db.commit()
    db.refresh(user)
    return {"user": user_out(user)}
