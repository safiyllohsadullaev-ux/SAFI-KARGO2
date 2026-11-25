import os
import tempfile
from pathlib import Path

_root = Path(tempfile.mkdtemp())
os.environ["DATABASE_URL"] = "sqlite:///" + (_root / "test.db").as_posix()
os.environ["JWT_SECRET"] = "test-secret-test-secret-test"
os.environ["DEV_OTP_REVEAL"] = "true"
os.environ["ADMIN_PHONE"] = "+992900000001"
os.environ["ADMIN_PASSWORD"] = "AdminPass123"
os.environ["ADMIN_FIRST_NAME"] = "Super"
os.environ["ADMIN_LAST_NAME"] = "Admin"
os.environ["STORAGE_DIR"] = str(_root / "storage")
os.environ["SMS_WEBHOOK_URL"] = ""
os.environ["CORS_ORIGINS"] = "http://localhost:3000"

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

settings.rate_limit_enabled = False
settings.dev_otp_reveal = True


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def register(client: TestClient, phone: str, first: str = "Али") -> dict:
    otp = client.post("/api/auth/otp", json={"phone": phone, "purpose": "register"})
    assert otp.status_code == 200, otp.text
    assert otp.json()["delivery"] == "dev"
    response = client.post(
        "/api/auth/register",
        json={
            "first_name": first,
            "last_name": "Тест",
            "phone": phone,
            "password": "SecretPass1",
            "password_confirm": "SecretPass1",
            "otp": otp.json()["dev_code"],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def login(client: TestClient, phone: str, password: str) -> dict:
    response = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert response.status_code == 200, response.text
    return response.json()
