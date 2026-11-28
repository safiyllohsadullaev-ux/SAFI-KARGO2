import csv
import io
import json
import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from fastapi import HTTPException, UploadFile
from openpyxl import load_workbook
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.hub import push, push_many
from app.models import (
    AuditLog,
    Branch,
    Conversation,
    Counter,
    FileAsset,
    Lesson,
    MarketplaceLink,
    Message,
    Notification,
    Order,
    OrderStatusHistory,
    OtpCode,
    ProhibitedItem,
    QrToken,
    Setting,
    Shipment,
    SocialLink,
    Tariff,
    User,
    Warehouse,
    utcnow,
)
from app.security import STAFF_ROLES, hash_password, hash_token, normalize_phone

STATUSES = [
    "china_warehouse",
    "in_transit",
    "tj_warehouse",
    "sorting",
    "delivery",
    "received",
]
STANDARD_NEXT = {
    "china_warehouse": "in_transit",
    "in_transit": "tj_warehouse",
    "tj_warehouse": "sorting",
    "sorting": "delivery",
    "delivery": "received",
}
CHINA_EDGES = {("china_warehouse", "in_transit")}
TJ_EDGES = {
    ("in_transit", "tj_warehouse"),
    ("tj_warehouse", "sorting"),
    ("sorting", "delivery"),
    ("delivery", "received"),
}
DELIVERY_SUBSTATUSES = {"ready_for_pickup", "handed_to_courier", "delivering"}
NOTIFY_TYPE = {
    "china_warehouse": "order_china",
    "in_transit": "order_transit",
    "tj_warehouse": "order_tj",
    "sorting": "order_sorting",
    "delivery": "order_delivery",
    "received": "order_received",
}
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".pdf", ".txt", ".doc", ".docx", ".xls", ".xlsx"}
MAX_FILE = 8 * 1024 * 1024
_BUCKETS: dict[str, list[float]] = defaultdict(list)


def allow(key: str, limit: int, window: int) -> None:
    if not settings.rate_limit_enabled:
        return
    now = time.time()
    bucket = [stamp for stamp in _BUCKETS[key] if now - stamp < window]
    if len(bucket) >= limit:
        _BUCKETS[key] = bucket
        raise HTTPException(status_code=429, detail="rate_limited")
    bucket.append(now)
    _BUCKETS[key] = bucket


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="date_invalid")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def loads(raw: str | None, fallback):
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return fallback


def dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def audit(db: Session, actor_id: int | None, action: str, entity_type: str, entity_id, old="", new="", reason="") -> None:
    db.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            old_value=old if isinstance(old, str) else dumps(old),
            new_value=new if isinstance(new, str) else dumps(new),
            reason=reason or "",
        )
    )


def allocate(db: Session, key: str, prefix: str, width: int) -> str:
    query = db.query(Counter).filter(Counter.key == key)
    bind = db.get_bind()
    if bind is not None and bind.dialect.name == "postgresql":
        query = query.with_for_update()
    row = query.one_or_none()
    if row is None:
        row = Counter(key=key, value=0)
        db.add(row)
        db.flush()
    row.value += 1
    db.flush()
    return f"{prefix}{row.value:0{width}d}"


def setting(db: Session, key: str, fallback):
    row = db.get(Setting, key)
    if row is None:
        return fallback
    return loads(row.value, fallback)


def put_setting(db: Session, key: str, value) -> None:
    row = db.get(Setting, key)
    encoded = dumps(value)
    if row is None:
        db.add(Setting(key=key, value=encoded))
    else:
        row.value = encoded


def user_out(user: User) -> dict:
    return {
        "id": user.id,
        "public_client_id": user.public_client_id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "phone": user.phone,
        "role": user.role,
        "language": user.language,
        "branch_id": user.branch_id,
        "is_blocked": user.is_blocked,
        "created_at": iso(user.created_at),
    }


def branch_out(branch: Branch | None) -> dict | None:
    if branch is None:
        return None
    return {
        "id": branch.id,
        "name": branch.name,
        "address": branch.address,
        "phone": branch.phone,
        "hours": branch.hours,
        "map_url": branch.map_url,
        "is_active": branch.is_active,
    }


def warehouse_out(row: Warehouse) -> dict:
    return {
        "id": row.id,
        "country": row.country,
        "name": row.name,
        "address": row.address,
        "phone": row.phone,
        "recipient_name": row.recipient_name,
        "instructions": row.instructions,
        "is_primary": row.is_primary,
        "is_active": row.is_active,
        "configured": bool((row.address or "").strip()),
    }


def primary_china_warehouse(db: Session) -> Warehouse | None:
    row = (
        db.query(Warehouse)
        .filter(Warehouse.country == "china", Warehouse.is_active.is_(True), Warehouse.is_primary.is_(True))
        .order_by(Warehouse.id.asc())
        .first()
    )
    if row:
        return row
    return (
        db.query(Warehouse)
        .filter(Warehouse.country == "china", Warehouse.is_active.is_(True))
        .order_by(Warehouse.id.asc())
        .first()
    )


def actor_map(db: Session, ids: set[int]) -> dict[int, User]:
    if not ids:
        return {}
    return {user.id: user for user in db.query(User).filter(User.id.in_(ids)).all()}


def history_out(db: Session, order: Order) -> list[dict]:
    rows = (
        db.query(OrderStatusHistory)
        .filter(OrderStatusHistory.order_id == order.id)
        .order_by(OrderStatusHistory.changed_at.asc(), OrderStatusHistory.id.asc())
        .all()
    )
    users = actor_map(db, {row.changed_by for row in rows if row.changed_by})
    result = []
    for row in rows:
        actor = users.get(row.changed_by or 0)
        result.append(
            {
                "id": row.id,
                "previous_status": row.previous_status,
                "new_status": row.new_status,
                "changed_at": iso(row.changed_at),
                "note": row.note,
                "reason": row.reason,
                "actor_name": f"{actor.first_name} {actor.last_name}".strip() if actor else "",
                "actor_role": actor.role if actor else "",
            }
        )
    return result


def order_out(db: Session, order: Order, include_history: bool = False) -> dict:
    shipment = order.shipment
    data = {
        "id": order.id,
        "order_number": order.order_number,
        "client_id": order.client_id,
        "public_client_id": order.client.public_client_id if order.client else None,
        "client_name": f"{order.client.first_name} {order.client.last_name}".strip() if order.client else "",
        "client_phone": order.client.phone if order.client else "",
        "tracking_number": order.tracking_number,
        "title": order.title,
        "weight": order.weight,
        "package_count": order.package_count,
        "current_status": order.current_status,
        "delivery_substatus": order.delivery_substatus,
        "shipment_id": order.shipment_id,
        "shipment_number": shipment.shipment_number if shipment else None,
        "shipment_status": shipment.status if shipment else None,
        "note": order.note,
        "photo_id": order.photo_id,
        "eta_text": order.eta_text,
        "pickup_point": order.pickup_point,
        "courier_contact": order.courier_contact,
        "confirmation_method": order.confirmation_method,
        "china_arrived_at": iso(order.china_arrived_at),
        "departed_at": iso(order.departed_at),
        "tj_arrived_at": iso(order.tj_arrived_at),
        "sorting_started_at": iso(order.sorting_started_at),
        "delivery_started_at": iso(order.delivery_started_at),
        "received_at": iso(order.received_at),
        "created_at": iso(order.created_at),
        "updated_at": iso(order.updated_at),
    }
    if include_history:
        data["history"] = history_out(db, order)
    return data


def stamp_status(order: Order, status: str, moment: datetime) -> None:
    if status == "china_warehouse":
        order.china_arrived_at = moment
    elif status == "in_transit":
        order.departed_at = moment
    elif status == "tj_warehouse":
        order.tj_arrived_at = moment
    elif status == "sorting":
        order.sorting_started_at = moment
    elif status == "delivery":
        order.delivery_started_at = moment
    elif status == "received":
        order.received_at = moment


def notify_user(db: Session, user_id: int, type_: str, payload: dict) -> None:
    db.add(Notification(user_id=user_id, type=type_, payload=dumps(payload)))


def after_commit_refresh(user_ids: set[int]) -> None:
    for user_id in user_ids:
        push(user_id, {"type": "orders"})
        push(user_id, {"type": "notification"})


def support_ids(db: Session) -> set[int]:
    rows = db.query(User.id).filter(User.role.in_(("support", "super_admin")), User.is_blocked.is_(False)).all()
    return {row[0] for row in rows}


def apply_status(
    db: Session,
    actor: User,
    order: Order,
    dst: str,
    *,
    note: str = "",
    reason: str = "",
    substatus: str | None = None,
    confirmation_method: str = "",
) -> None:
    if dst not in STATUSES:
        raise HTTPException(status_code=400, detail="bad_status")
    src = order.current_status
    if src == dst:
        if dst == "delivery" and substatus:
            set_substatus(db, actor, order, substatus, note)
            return
        raise HTTPException(status_code=400, detail="same_status")
    standard = STANDARD_NEXT.get(src) == dst
    if actor.role in ("client", "support"):
        raise HTTPException(status_code=403, detail="forbidden")
    if actor.role == "warehouse_china" and (src, dst) not in CHINA_EDGES:
        raise HTTPException(status_code=403, detail="forbidden")
    if actor.role == "warehouse_tajikistan" and (src, dst) not in TJ_EDGES:
        raise HTTPException(status_code=403, detail="forbidden")
    if actor.role == "super_admin" and not standard and not reason.strip():
        raise HTTPException(status_code=400, detail="reason_required")
    if actor.role != "super_admin" and not standard:
        raise HTTPException(status_code=403, detail="forbidden")
    moment = utcnow()
    previous = src
    order.current_status = dst
    order.updated_at = moment
    stamp_status(order, dst, moment)
    if dst == "delivery":
        if substatus and substatus not in DELIVERY_SUBSTATUSES:
            raise HTTPException(status_code=400, detail="bad_substatus")
        order.delivery_substatus = substatus or "ready_for_pickup"
    if dst == "received":
        order.confirmation_method = confirmation_method or "staff"
    if note:
        order.note = note
    db.add(
        OrderStatusHistory(
            order_id=order.id,
            previous_status=previous,
            new_status=dst,
            changed_by=actor.id,
            changed_at=moment,
            note=note or "",
            reason=reason or "",
        )
    )
    notify_user(
        db,
        order.client_id,
        NOTIFY_TYPE[dst],
        {"order_number": order.order_number, "status": dst},
    )
    audit(
        db,
        actor.id,
        "order.status",
        "order",
        order.id,
        previous,
        dst,
        reason or note,
    )
    if dst == "tj_warehouse":
        refresh_shipment(db, order.shipment_id)


def set_substatus(db: Session, actor: User, order: Order, substatus: str, note: str = "") -> None:
    if actor.role not in ("warehouse_tajikistan", "super_admin"):
        raise HTTPException(status_code=403, detail="forbidden")
    if order.current_status != "delivery":
        raise HTTPException(status_code=400, detail="bad_transition")
    if substatus not in DELIVERY_SUBSTATUSES:
        raise HTTPException(status_code=400, detail="bad_substatus")
    previous = order.delivery_substatus or ""
    order.delivery_substatus = substatus
    order.updated_at = utcnow()
    if note:
        order.note = note
    db.add(
        OrderStatusHistory(
            order_id=order.id,
            previous_status="delivery",
            new_status="delivery",
            changed_by=actor.id,
            note=f"{previous}->{substatus}",
            reason=note or "",
        )
    )
    notify_user(db, order.client_id, "order_delivery", {"order_number": order.order_number, "status": "delivery", "substatus": substatus})
    audit(db, actor.id, "order.substatus", "order", order.id, previous, substatus, note)


def refresh_shipment(db: Session, shipment_id: int | None) -> None:
    if not shipment_id:
        return
    orders = db.query(Order).filter(Order.shipment_id == shipment_id).all()
    if not orders:
        return
    if all(item.current_status not in ("china_warehouse", "in_transit") for item in orders):
        shipment = db.get(Shipment, shipment_id)
        if shipment and shipment.status != "arrived":
            shipment.status = "arrived"
            shipment.arrival_date = shipment.arrival_date or utcnow()


def create_order(
    db: Session,
    actor: User,
    *,
    client: User,
    tracking_number: str | None,
    title: str,
    weight: float | None,
    package_count: int,
    note: str,
    eta_text: str = "",
    pickup_point: str = "",
) -> Order:
    if actor.role not in ("super_admin", "warehouse_china"):
        raise HTTPException(status_code=403, detail="forbidden")
    if client.role != "client":
        raise HTTPException(status_code=400, detail="not_a_client")
    tracking = (tracking_number or "").strip() or None
    if tracking and db.query(Order).filter(Order.tracking_number == tracking).first():
        raise HTTPException(status_code=409, detail="tracking_exists")
    moment = utcnow()
    order = Order(
        order_number=allocate(db, "order", "SF-", 6),
        client_id=client.id,
        tracking_number=tracking,
        title=(title or "").strip(),
        weight=weight,
        package_count=package_count or 1,
        current_status="china_warehouse",
        note=note or "",
        eta_text=eta_text or "",
        pickup_point=pickup_point or "",
        branch_id=client.branch_id,
        china_arrived_at=moment,
        created_by=actor.id,
    )
    db.add(order)
    db.flush()
    db.add(
        OrderStatusHistory(
            order_id=order.id,
            previous_status=None,
            new_status="china_warehouse",
            changed_by=actor.id,
            note=note or "",
        )
    )
    notify_user(db, client.id, "order_china", {"order_number": order.order_number, "status": "china_warehouse"})
    audit(db, actor.id, "order.create", "order", order.id, "", order.order_number, "")
    return order


def dispatch_orders(
    db: Session,
    actor: User,
    order_ids: list[int],
    *,
    shipment_number: str | None,
    transport: str,
    departure_at: datetime | None,
    note: str,
) -> Shipment:
    if actor.role not in ("super_admin", "warehouse_china"):
        raise HTTPException(status_code=403, detail="forbidden")
    if not order_ids:
        raise HTTPException(status_code=400, detail="select_orders")
    orders = db.query(Order).filter(Order.id.in_(order_ids)).all()
    if len(orders) != len(set(order_ids)):
        raise HTTPException(status_code=404, detail="order_not_found")
    if any(order.current_status != "china_warehouse" for order in orders):
        raise HTTPException(status_code=400, detail="not_in_china_warehouse")
    number = (shipment_number or "").strip() or allocate(db, "shipment", "TR-", 4)
    if db.query(Shipment).filter(Shipment.shipment_number == number).first():
        raise HTTPException(status_code=409, detail="shipment_exists")
    moment = departure_at or utcnow()
    shipment = Shipment(
        shipment_number=number,
        departure_date=moment,
        transport=(transport or "").strip(),
        status="departed",
        note=note or "",
        created_by=actor.id,
    )
    db.add(shipment)
    db.flush()
    for order in orders:
        order.shipment_id = shipment.id
        apply_status(db, actor, order, "in_transit", note=note)
        order.departed_at = moment
    audit(db, actor.id, "shipment.dispatch", "shipment", shipment.id, "", {"orders": order_ids, "number": number}, note)
    return shipment


def save_upload(db: Session, owner_id: int | None, upload: UploadFile) -> FileAsset:
    original = Path(upload.filename or "file").name
    ext = Path(original).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="file_type")
    limit = 4 * 1024 * 1024 if settings.on_vercel else MAX_FILE
    data = upload.file.read(limit + 1)
    if not data:
        raise HTTPException(status_code=400, detail="file_empty")
    if len(data) > limit:
        raise HTTPException(status_code=400, detail="file_too_large")
    stored = secrets.token_hex(16) + ext
    payload = None
    if settings.storage_backend == "database":
        payload = data
    else:
        folder = Path(settings.storage_dir)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / stored).write_bytes(data)
    asset = FileAsset(
        owner_id=owner_id,
        stored_name=stored,
        original_name=original,
        mime=upload.content_type or "application/octet-stream",
        size=len(data),
        content=payload,
    )
    db.add(asset)
    db.flush()
    return asset


def can_read_file(db: Session, user: User, asset: FileAsset) -> bool:
    if user.role in STAFF_ROLES:
        return True
    if asset.owner_id == user.id:
        return True
    owned_order = db.query(Order.id).filter(Order.photo_id == asset.id, Order.client_id == user.id).first()
    if owned_order:
        return True
    message = db.query(Message).filter(Message.file_id == asset.id).first()
    if message:
        conversation = db.get(Conversation, message.conversation_id)
        return bool(conversation and conversation.client_id == user.id)
    return False


def deliver_sms(phone: str, code: str) -> str:
    if settings.sms_webhook_url:
        try:
            response = httpx.post(
                settings.sms_webhook_url,
                json={"phone": phone, "message": f"SAFI KARGO: {code}"},
                timeout=10,
            )
            response.raise_for_status()
        except Exception:
            raise HTTPException(status_code=502, detail="sms_failed")
        return "sent"
    if settings.reveal_otp:
        return "dev"
    raise HTTPException(status_code=503, detail="sms_not_configured")


def request_otp(db: Session, phone: str, purpose: str) -> dict:
    phone = normalize_phone(phone)
    if purpose not in ("register", "reset"):
        raise HTTPException(status_code=400, detail="bad_purpose")
    allow(f"otp:{phone}", 3, 600)
    existing = db.query(User).filter(User.phone == phone).one_or_none()
    if purpose == "register" and existing:
        raise HTTPException(status_code=409, detail="phone_taken")
    if purpose == "reset" and existing is None:
        return {"delivery": "accepted", "sms_configured": bool(settings.sms_webhook_url)}
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(
        OtpCode(
            phone=phone,
            purpose=purpose,
            code_hash=hash_token(code),
            expires_at=utcnow() + timedelta(minutes=5),
        )
    )
    delivery = deliver_sms(phone, code)
    result = {"delivery": delivery, "sms_configured": bool(settings.sms_webhook_url)}
    if delivery == "dev":
        result["dev_code"] = code
    return result


def confirmed_supabase_email(access_token: str) -> str:
    base = settings.supabase_url.strip().rstrip("/")
    key = (settings.supabase_publishable_key or settings.supabase_anon_key).strip()
    if not base or not key:
        raise HTTPException(status_code=503, detail="email_not_configured")
    try:
        response = httpx.get(
            f"{base}/auth/v1/user",
            headers={"Authorization": f"Bearer {access_token}", "apikey": key},
            timeout=10,
        )
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="email_not_configured")
    if response.status_code != 200:
        raise HTTPException(status_code=403, detail="email_not_confirmed")
    body = response.json()
    email = str(body.get("email") or "").strip().lower()
    confirmed = body.get("email_confirmed_at") or body.get("confirmed_at")
    if not email or not confirmed:
        raise HTTPException(status_code=403, detail="email_not_confirmed")
    return email


def consume_otp(db: Session, phone: str, purpose: str, code: str) -> None:
    phone = normalize_phone(phone)
    row = (
        db.query(OtpCode)
        .filter(OtpCode.phone == phone, OtpCode.purpose == purpose, OtpCode.consumed.is_(False))
        .order_by(OtpCode.id.desc())
        .first()
    )
    if row is None:
        raise HTTPException(status_code=400, detail="otp_invalid")
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < utcnow():
        raise HTTPException(status_code=400, detail="otp_expired")
    if row.attempts >= 5:
        raise HTTPException(status_code=400, detail="otp_invalid")
    if hash_token((code or "").strip()) != row.code_hash:
        row.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="otp_invalid")
    row.consumed = True


def active_tariffs(db: Session) -> list[Tariff]:
    now = utcnow()
    rows = db.query(Tariff).filter(Tariff.is_active.is_(True)).order_by(Tariff.category.asc()).all()
    ready = []
    for row in rows:
        start = row.effective_from
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if start <= now:
            ready.append(row)
    return ready


def tariff_out(row: Tariff) -> dict:
    return {
        "id": row.id,
        "category": row.category,
        "price_per_kg": row.price_per_kg,
        "currency": row.currency,
        "min_weight": row.min_weight,
        "conditions": row.conditions,
        "effective_from": iso(row.effective_from),
        "is_active": row.is_active,
    }


def quote(weight: float, tariff: Tariff) -> dict:
    if weight <= 0:
        raise HTTPException(status_code=400, detail="weight_invalid")
    billable = max(weight, tariff.min_weight or 0)
    return {
        "tariff_id": tariff.id,
        "category": tariff.category,
        "currency": tariff.currency,
        "billable_weight": round(billable, 3),
        "amount": round(billable * tariff.price_per_kg, 2),
        "price_per_kg": tariff.price_per_kg,
        "estimate": True,
    }


def check_address(text: str, warehouse: Warehouse | None, client_code: str) -> dict:
    if warehouse is None or not (warehouse.address or "").strip():
        return {"configured": False, "ok": False, "missing": ["warehouse"], "checks": {}}
    hay = "".join((text or "").lower().split())
    parts = [part.strip() for part in warehouse.address.replace("\n", ",").split(",") if len(part.strip()) >= 4]
    if parts:
        hits = sum(1 for part in parts if "".join(part.lower().split()) in hay)
        address_ok = hits >= max(1, len(parts) - 1) or "".join(warehouse.address.lower().split()) in hay
    else:
        address_ok = "".join(warehouse.address.lower().split()) in hay
    phone = (warehouse.phone or "").strip()
    phone_digits = "".join(ch for ch in phone if ch.isdigit())
    text_digits = "".join(ch for ch in (text or "") if ch.isdigit())
    checks = {"code": client_code.lower() in (text or "").lower(), "address": address_ok}
    if phone_digits:
        checks["phone"] = phone_digits in text_digits
    missing = [key for key, ok in checks.items() if not ok]
    return {"configured": True, "ok": not missing, "missing": missing, "checks": checks}


def status_counts(db: Session, client_id: int | None = None) -> dict[str, int]:
    query = db.query(Order.current_status, func.count(Order.id))
    if client_id is not None:
        query = query.filter(Order.client_id == client_id)
    rows = query.group_by(Order.current_status).all()
    counts = {status: 0 for status in STATUSES}
    for status, count in rows:
        counts[status] = int(count)
    return counts


def unread_messages(db: Session, user: User) -> int:
    if user.role == "client":
        conversation = db.query(Conversation).filter(Conversation.client_id == user.id).one_or_none()
        if conversation is None:
            return 0
        return (
            db.query(Message)
            .filter(
                Message.conversation_id == conversation.id,
                Message.sender_id != user.id,
                Message.read_at.is_(None),
            )
            .count()
        )
    return (
        db.query(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .filter(Message.read_at.is_(None), Message.sender_id == Conversation.client_id)
        .count()
    )


def badges(db: Session, user: User) -> dict:
    if user.role == "client":
        active = (
            db.query(Order)
            .filter(Order.client_id == user.id, Order.current_status != "received")
            .count()
        )
    else:
        active = db.query(Order).filter(Order.current_status != "received").count()
    return {"orders": active, "messages": unread_messages(db, user)}


def ensure_conversation(db: Session, client: User) -> Conversation:
    row = db.query(Conversation).filter(Conversation.client_id == client.id).one_or_none()
    if row is None:
        row = Conversation(client_id=client.id, status="open")
        db.add(row)
        db.flush()
    return row


def message_out(row: Message) -> dict:
    return {
        "id": row.id,
        "conversation_id": row.conversation_id,
        "sender_id": row.sender_id,
        "sender_role": row.sender.role if row.sender else "",
        "sender_name": f"{row.sender.first_name} {row.sender.last_name}".strip() if row.sender else "",
        "content": row.content,
        "file_id": row.file_id,
        "file_name": row.file.original_name if row.file else None,
        "file_mime": row.file.mime if row.file else None,
        "created_at": iso(row.created_at),
        "read_at": iso(row.read_at),
    }


def support_is_online(db: Session) -> bool:
    online = hub_online()
    if not online:
        return False
    row = (
        db.query(User.id)
        .filter(User.id.in_(online), User.role.in_(("support", "super_admin")), User.is_blocked.is_(False))
        .first()
    )
    return row is not None


def hub_online() -> set[int]:
    from app.hub import hub

    return hub.online_ids()


def issue_pickup_token(db: Session, order: Order) -> str:
    db.query(QrToken).filter(QrToken.order_id == order.id, QrToken.used_at.is_(None)).delete(synchronize_session=False)
    raw = "SK1." + secrets.token_urlsafe(32)
    db.add(
        QrToken(
            order_id=order.id,
            token_hash=hash_token(raw),
            expires_at=utcnow() + timedelta(hours=24),
        )
    )
    db.flush()
    return raw


def find_token(db: Session, raw: str) -> QrToken:
    token = (raw or "").strip()
    row = db.query(QrToken).filter(QrToken.token_hash == hash_token(token)).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="token_invalid")
    if row.used_at is not None:
        raise HTTPException(status_code=400, detail="token_used")
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < utcnow():
        raise HTTPException(status_code=400, detail="token_expired")
    return row


def read_table(upload: UploadFile) -> list[dict]:
    name = (upload.filename or "").lower()
    data = upload.file.read()
    if name.endswith(".xlsx"):
        workbook = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        sheet = workbook.active
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            return []
        headers = [str(cell or "").strip() for cell in rows[0]]
        parsed = []
        for row in rows[1:]:
            if not any(row):
                continue
            parsed.append({headers[index]: row[index] for index in range(len(headers))})
        return parsed
    text = data.decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


def import_orders(db: Session, actor: User, rows: list[dict]) -> dict:
    if actor.role not in ("super_admin", "warehouse_china"):
        raise HTTPException(status_code=403, detail="forbidden")
    created = 0
    skipped = []
    errors = []
    for index, row in enumerate(rows, start=2):
        try:
            public_id = str(row.get("public_client_id") or row.get("client_id") or "").strip()
            tracking = str(row.get("tracking_number") or "").strip()
            title = str(row.get("title") or "").strip()
            note = str(row.get("note") or "").strip()
            raw_weight = row.get("weight")
            weight = float(raw_weight) if raw_weight not in (None, "") else None
            raw_count = row.get("package_count") or 1
            package_count = int(float(raw_count))
            client = db.query(User).filter(User.public_client_id == public_id, User.role == "client").one_or_none()
            if client is None:
                errors.append({"row": index, "error": "client_not_found"})
                continue
            if tracking and db.query(Order).filter(Order.tracking_number == tracking).first():
                skipped.append({"row": index, "tracking_number": tracking})
                continue
            create_order(
                db,
                actor,
                client=client,
                tracking_number=tracking or None,
                title=title,
                weight=weight,
                package_count=package_count,
                note=note,
            )
            created += 1
        except HTTPException as exc:
            errors.append({"row": index, "error": str(exc.detail)})
        except Exception:
            errors.append({"row": index, "error": "row_invalid"})
    return {"created": created, "skipped": skipped, "errors": errors}


def broadcast_message(db: Session, conversation: Conversation) -> None:
    targets = support_ids(db)
    targets.add(conversation.client_id)
    push_many(targets, {"type": "message", "conversation_id": conversation.id})


def client_stats(db: Session, user: User) -> dict:
    orders = db.query(Order).filter(Order.client_id == user.id).all()
    counts = status_counts(db, user.id)
    weight = sum(order.weight or 0 for order in orders if order.weight is not None and order.current_status == "received")
    return {
        "total": len(orders),
        "in_transit": counts["in_transit"],
        "in_warehouse": counts["china_warehouse"] + counts["tj_warehouse"] + counts["sorting"],
        "received": counts["received"],
        "received_weight": round(weight, 3),
        "counts": counts,
    }
