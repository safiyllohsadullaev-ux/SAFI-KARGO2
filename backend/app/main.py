import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

import jwt
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.database import DATABASE_URL, Base, SessionLocal, engine
from app.hub import hub
from app.models import User
from app.routers import admin, auth, chat, client, files, public
from app.seed import seed

_WEAK_SECRETS = {"dev-only-change-me", "change-this-to-a-long-random-secret", "secret", "changeme"}


def ensure_file_column() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("files"):
        return
    names = {column["name"] for column in inspector.get_columns("files")}
    if "content" in names:
        return
    kind = "BLOB" if DATABASE_URL.startswith("sqlite") else "BYTEA"
    with engine.begin() as connection:
        connection.execute(text(f"ALTER TABLE files ADD COLUMN content {kind}"))


def init_db() -> None:
    if settings.on_vercel:
        if not DATABASE_URL.startswith("postgresql"):
            raise RuntimeError("На Vercel DATABASE_URL-ро ба Postgres (Neon) гузоред. SQLite дар serverless нест намешавад.")
        if settings.jwt_secret.strip().lower() in _WEAK_SECRETS or len(settings.jwt_secret) < 24:
            raise RuntimeError("На Vercel JWT_SECRET-и дароз ва тасодуфӣ гузоред.")
    if DATABASE_URL.startswith("sqlite:///"):
        Path(DATABASE_URL.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    if settings.storage_backend == "disk":
        Path(settings.storage_dir).mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    ensure_file_column()
    db = SessionLocal()
    try:
        seed(db)
        db.commit()
    except IntegrityError:
        db.rollback()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app import hub as hub_module

    hub_module.main_loop = asyncio.get_running_loop()
    init_db()
    yield


app = FastAPI(title="SAFI KARGO", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_origin_regex=r"https://([a-zA-Z0-9-]+\.)*vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


app.include_router(auth.router)
app.include_router(public.router)
app.include_router(client.router)
app.include_router(chat.router)
app.include_router(admin.router)
app.include_router(files.router)


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "name": "SAFI KARGO",
        "sms_configured": bool(settings.sms_webhook_url),
        "database": "postgres" if DATABASE_URL.startswith("postgresql") else "sqlite",
        "storage": settings.storage_backend,
    }


@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    user_id = None
    db = SessionLocal()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        user = db.get(User, int(payload.get("sub", "0")))
        if user is None or user.is_blocked or user.session_version != int(payload.get("sv", -1)):
            await websocket.accept()
            await websocket.close(code=4401)
            return
        user_id = user.id
    except Exception:
        await websocket.accept()
        await websocket.close(code=4401)
        return
    finally:
        db.close()
    await hub.connect(user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if user_id is not None:
            hub.disconnect(user_id, websocket)
