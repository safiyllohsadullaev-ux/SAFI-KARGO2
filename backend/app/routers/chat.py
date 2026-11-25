from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Conversation, Message, User, utcnow
from app.security import STAFF_ROLES, get_current_user
from app.services import (
    allow,
    broadcast_message,
    ensure_conversation,
    iso,
    message_out,
    notify_user,
    save_upload,
    support_is_online,
    user_out,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])


def conversation_for(db: Session, user: User, conversation_id: int | None = None) -> Conversation:
    if user.role == "client":
        row = ensure_conversation(db, user)
        if conversation_id is not None and conversation_id != row.id:
            raise HTTPException(status_code=404, detail="conversation_not_found")
        return row
    if user.role not in ("support", "super_admin"):
        raise HTTPException(status_code=403, detail="forbidden")
    if conversation_id is None:
        raise HTTPException(status_code=404, detail="conversation_not_found")
    row = db.get(Conversation, conversation_id)
    if row is None:
        raise HTTPException(status_code=404, detail="conversation_not_found")
    return row


def mark_read(db: Session, user: User, conversation: Conversation) -> None:
    query = db.query(Message).filter(Message.conversation_id == conversation.id, Message.read_at.is_(None))
    if user.role == "client":
        query = query.filter(Message.sender_id != user.id)
    else:
        query = query.filter(Message.sender_id == conversation.client_id)
    query.update({Message.read_at: datetime.now(timezone.utc)})


@router.get("/presence")
def presence(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"online": support_is_online(db)}


@router.get("/conversations")
def conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role == "client":
        row = ensure_conversation(db, user)
        db.commit()
        last = (
            db.query(Message)
            .filter(Message.conversation_id == row.id)
            .order_by(Message.id.desc())
            .first()
        )
        unread = (
            db.query(Message)
            .filter(Message.conversation_id == row.id, Message.sender_id != user.id, Message.read_at.is_(None))
            .count()
        )
        return {
            "online": support_is_online(db),
            "items": [
                {
                    "id": row.id,
                    "status": row.status,
                    "client": user_out(user),
                    "assigned_to": row.assigned_to,
                    "last_message": message_out(last) if last else None,
                    "unread": unread,
                    "last_message_at": iso(row.last_message_at),
                }
            ],
        }
    if user.role not in ("support", "super_admin"):
        raise HTTPException(status_code=403, detail="forbidden")
    rows = db.query(Conversation).order_by(Conversation.last_message_at.desc(), Conversation.id.desc()).all()
    items = []
    for row in rows:
        last = (
            db.query(Message).filter(Message.conversation_id == row.id).order_by(Message.id.desc()).first()
        )
        unread = (
            db.query(Message)
            .filter(Message.conversation_id == row.id, Message.sender_id == row.client_id, Message.read_at.is_(None))
            .count()
        )
        items.append(
            {
                "id": row.id,
                "status": row.status,
                "client": user_out(row.client) if row.client else None,
                "assigned_to": row.assigned_to,
                "last_message": message_out(last) if last else None,
                "unread": unread,
                "last_message_at": iso(row.last_message_at),
            }
        )
    return {"online": support_is_online(db), "items": items}


@router.get("/conversations/{conversation_id}/messages")
def messages(conversation_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = conversation_for(db, user, conversation_id)
    if user.role == "client" and conversation.client_id != user.id:
        raise HTTPException(status_code=403, detail="forbidden")
    mark_read(db, user, conversation)
    rows = db.query(Message).filter(Message.conversation_id == conversation.id).order_by(Message.id.asc()).all()
    db.commit()
    return {"conversation_id": conversation.id, "status": conversation.status, "items": [message_out(row) for row in rows]}


@router.post("/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: int,
    content: str = Form(""),
    upload: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allow(f"chat:{user.id}", 20, 60)
    conversation = conversation_for(db, user, conversation_id)
    if user.role == "client" and conversation.client_id != user.id:
        raise HTTPException(status_code=403, detail="forbidden")
    if user.role not in ("client", "support", "super_admin"):
        raise HTTPException(status_code=403, detail="forbidden")
    text = (content or "").strip()
    if len(text) > 4000:
        raise HTTPException(status_code=400, detail="message_too_long")
    asset = None
    if upload is not None and upload.filename:
        asset = save_upload(db, user.id, upload)
    if not text and asset is None:
        raise HTTPException(status_code=400, detail="message_empty")
    if conversation.status == "closed" and user.role == "client":
        conversation.status = "open"
    moment = utcnow()
    row = Message(
        conversation_id=conversation.id,
        sender_id=user.id,
        content=text,
        file_id=asset.id if asset else None,
        created_at=moment,
    )
    conversation.last_message_at = moment
    db.add(row)
    if user.role != "client":
        notify_user(db, conversation.client_id, "chat_message", {"conversation_id": conversation.id})
    db.commit()
    db.refresh(row)
    broadcast_message(db, conversation)
    return message_out(row)


@router.post("/conversations/{conversation_id}/assign")
def assign(conversation_id: int, assignee_id: int | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role not in ("support", "super_admin"):
        raise HTTPException(status_code=403, detail="forbidden")
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="conversation_not_found")
    if assignee_id is not None:
        assignee = db.get(User, assignee_id)
        if assignee is None or assignee.role not in ("support", "super_admin"):
            raise HTTPException(status_code=400, detail="assignee_invalid")
    conversation.assigned_to = assignee_id
    db.commit()
    return {"ok": True}


@router.post("/conversations/{conversation_id}/close")
def close_conversation(conversation_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role not in ("support", "super_admin"):
        raise HTTPException(status_code=403, detail="forbidden")
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="conversation_not_found")
    conversation.status = "closed" if conversation.status != "closed" else "open"
    db.commit()
    return {"status": conversation.status}
