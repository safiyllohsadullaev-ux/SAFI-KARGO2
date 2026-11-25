import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User

bearer = HTTPBearer(auto_error=False)
PBKDF2_ROUNDS = 310_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return "pbkdf2$" + salt.hex() + "$" + digest.hex()


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_hex, digest_hex = stored.split("$")
        if scheme != "pbkdf2":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            PBKDF2_ROUNDS,
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except Exception:
        return False


def hash_token(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def normalize_phone(value: str) -> str:
    raw = "".join(ch for ch in (value or "").strip() if ch.isdigit() or ch == "+")
    if raw.startswith("00"):
        raw = "+" + raw[2:]
    if raw and not raw.startswith("+"):
        raw = "+" + raw
    digits = raw[1:] if raw.startswith("+") else ""
    if not digits.isdigit() or not (8 <= len(digits) <= 15):
        raise HTTPException(status_code=400, detail="phone_invalid")
    return "+" + digits


def create_access_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "sv": user.session_version,
        "exp": datetime.now(timezone.utc) + timedelta(days=settings.jwt_days),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="unauthorized")
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
        user_id = int(payload.get("sub", "0"))
        version = int(payload.get("sv", -1))
    except Exception:
        raise HTTPException(status_code=401, detail="unauthorized")
    user = db.get(User, user_id)
    if user is None or user.session_version != version:
        raise HTTPException(status_code=401, detail="unauthorized")
    if user.is_blocked:
        raise HTTPException(status_code=403, detail="user_blocked")
    return user


def require_roles(*roles: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="forbidden")
        return user

    return dependency


STAFF_ROLES = ("super_admin", "warehouse_china", "warehouse_tajikistan", "support")
