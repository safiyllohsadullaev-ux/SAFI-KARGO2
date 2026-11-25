import shutil
from datetime import datetime, time, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.database import DATABASE_URL, get_db
from app.models import (
    AuditLog,
    Branch,
    Conversation,
    Lesson,
    MarketplaceLink,
    Order,
    ProhibitedItem,
    Shipment,
    SocialLink,
    Tariff,
    User,
    Warehouse,
    utcnow,
)
from app.security import STAFF_ROLES, get_current_user, hash_password, normalize_phone
from app.services import (
    after_commit_refresh,
    apply_status,
    audit,
    branch_out,
    create_order,
    dispatch_orders,
    dumps,
    find_token,
    import_orders,
    iso,
    loads,
    order_out,
    parse_dt,
    put_setting,
    read_table,
    save_upload,
    setting,
    status_counts,
    tariff_out,
    user_out,
    warehouse_out,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])
STAFF_CREATABLE = {"super_admin", "warehouse_china", "warehouse_tajikistan", "support"}


def staff_user(user: User = Depends(get_current_user)) -> User:
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="forbidden")
    return user


def super_user(user: User = Depends(staff_user)) -> User:
    if user.role != "super_admin":
        raise HTTPException(status_code=403, detail="forbidden")
    return user


class OrderIn(BaseModel):
    public_client_id: str
    tracking_number: str | None = None
    title: str = ""
    weight: float | None = None
    package_count: int = 1
    note: str = ""


class DispatchIn(BaseModel):
    order_ids: list[int]
    shipment_number: str | None = None
    transport: str = ""
    departure_at: str | None = None
    note: str = ""


class TransitionIn(BaseModel):
    order_ids: list[int]
    to_status: str
    note: str = ""
    reason: str = ""
    delivery_substatus: str | None = None
    pickup_point: str = ""
    courier_contact: str = ""
    eta_text: str = ""


class CorrectIn(BaseModel):
    to_status: str
    reason: str = ""
    note: str = ""


class TokenIn(BaseModel):
    token: str
    note: str = ""


class StaffIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    phone: str
    password: str = Field(min_length=8, max_length=128)
    role: str


class StaffPatch(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    role: str | None = None
    is_blocked: bool | None = None
    password: str | None = None


class ClientPatch(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    branch_id: int | None = None
    is_blocked: bool | None = None


class BranchIn(BaseModel):
    name: str
    address: str = ""
    phone: str = ""
    hours: str = ""
    map_url: str = ""
    is_active: bool = True


class WarehouseIn(BaseModel):
    country: str
    name: str = ""
    address: str = ""
    phone: str = ""
    recipient_name: str = ""
    instructions: str = ""
    is_primary: bool = False
    is_active: bool = True


class TariffIn(BaseModel):
    category: str
    price_per_kg: float
    currency: str = "USD"
    min_weight: float = 0
    conditions: str = ""
    effective_from: str | None = None
    is_active: bool = True


class CmsIn(BaseModel):
    banner: dict | None = None
    eta: dict | None = None
    terms: dict | None = None
    info_notice: dict | None = None
    marketplaces: list[dict] | None = None
    socials: list[dict] | None = None


class TextIn(BaseModel):
    title: dict
    note: dict | None = None
    body: dict | None = None
    slug: str | None = None
    sort_order: int = 0


def client_ids(orders: list[Order]) -> set[int]:
    return {order.client_id for order in orders}


@router.get("/dashboard")
def dashboard(user: User = Depends(staff_user), db: Session = Depends(get_db)):
    week = utcnow() - timedelta(days=6)
    clients = db.query(User).filter(User.role == "client").count()
    new_clients = db.query(User).filter(User.role == "client", User.created_at >= week).count()
    open_chats = db.query(Conversation).filter(Conversation.status == "open").count()
    days = []
    for offset in range(6, -1, -1):
        day = (utcnow() - timedelta(days=offset)).date()
        start = datetime.combine(day, time.min, tzinfo=timezone.utc)
        count = db.query(User).filter(
            User.role == "client",
            User.created_at >= start,
            User.created_at < start + timedelta(days=1),
        ).count()
        days.append({"date": str(day), "count": count})
    return {
        "clients": clients,
        "new_clients": new_clients,
        "counts": status_counts(db),
        "open_chats": open_chats,
        "registrations": days,
    }


@router.get("/clients")
def clients(q: str = "", user: User = Depends(staff_user), db: Session = Depends(get_db)):
    query = db.query(User).filter(User.role == "client")
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                User.public_client_id.ilike(like),
                User.phone.ilike(like),
                User.first_name.ilike(like),
                User.last_name.ilike(like),
            )
        )
    rows = query.order_by(User.id.desc()).limit(100).all()
    return {"items": [user_out(row) for row in rows]}


@router.get("/clients/{client_id}")
def client_detail(client_id: int, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    client = db.get(User, client_id)
    if client is None or client.role != "client":
        raise HTTPException(status_code=404, detail="client_not_found")
    orders = db.query(Order).filter(Order.client_id == client.id).order_by(Order.id.desc()).all()
    branch = db.get(Branch, client.branch_id) if client.branch_id else None
    return {"user": user_out(client), "branch": branch_out(branch), "orders": [order_out(db, row) for row in orders]}


@router.patch("/clients/{client_id}")
def patch_client(client_id: int, payload: ClientPatch, user: User = Depends(super_user), db: Session = Depends(get_db)):
    client = db.get(User, client_id)
    if client is None or client.role != "client":
        raise HTTPException(status_code=404, detail="client_not_found")
    before = user_out(client)
    if payload.first_name is not None:
        client.first_name = payload.first_name.strip()
    if payload.last_name is not None:
        client.last_name = payload.last_name.strip()
    if payload.phone is not None:
        phone = normalize_phone(payload.phone)
        taken = db.query(User).filter(User.phone == phone, User.id != client.id).first()
        if taken:
            raise HTTPException(status_code=409, detail="phone_taken")
        client.phone = phone
    if "branch_id" in payload.model_fields_set:
        if payload.branch_id in (None, 0):
            client.branch_id = None
        else:
            branch = db.get(Branch, payload.branch_id)
            if branch is None:
                raise HTTPException(status_code=400, detail="branch_invalid")
            client.branch_id = branch.id
    if payload.is_blocked is not None:
        client.is_blocked = payload.is_blocked
        if payload.is_blocked:
            client.session_version += 1
    audit(db, user.id, "client.update", "user", client.id, before, user_out(client), "")
    db.commit()
    return {"user": user_out(client)}


@router.get("/orders")
def orders(
    status: str = "",
    q: str = "",
    client_id: int | None = None,
    user: User = Depends(staff_user),
    db: Session = Depends(get_db),
):
    query = db.query(Order)
    if status:
        query = query.filter(Order.current_status == status)
    if client_id:
        query = query.filter(Order.client_id == client_id)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.join(User, Order.client_id == User.id).filter(
            or_(
                Order.order_number.ilike(like),
                Order.tracking_number.ilike(like),
                User.public_client_id.ilike(like),
                User.phone.ilike(like),
            )
        )
    rows = query.order_by(Order.id.desc()).limit(200).all()
    return {"items": [order_out(db, row) for row in rows]}


@router.post("/orders")
def add_order(payload: OrderIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    client = db.query(User).filter(User.public_client_id == payload.public_client_id.strip(), User.role == "client").one_or_none()
    if client is None:
        raise HTTPException(status_code=404, detail="client_not_found")
    order = create_order(
        db,
        user,
        client=client,
        tracking_number=payload.tracking_number,
        title=payload.title,
        weight=payload.weight,
        package_count=payload.package_count,
        note=payload.note,
    )
    db.commit()
    after_commit_refresh({client.id})
    db.refresh(order)
    return order_out(db, order, include_history=True)


@router.get("/orders/{order_id}")
def order_detail(order_id: int, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="order_not_found")
    return order_out(db, order, include_history=True)


@router.post("/orders/{order_id}/photo")
def order_photo(
    order_id: int,
    upload: UploadFile = File(...),
    user: User = Depends(staff_user),
    db: Session = Depends(get_db),
):
    if user.role not in ("super_admin", "warehouse_china", "warehouse_tajikistan"):
        raise HTTPException(status_code=403, detail="forbidden")
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="order_not_found")
    asset = save_upload(db, user.id, upload)
    order.photo_id = asset.id
    audit(db, user.id, "order.photo", "order", order.id, "", asset.id, "")
    db.commit()
    return {"photo_id": asset.id}


@router.post("/dispatch")
def dispatch(payload: DispatchIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    orders = db.query(Order).filter(Order.id.in_(payload.order_ids)).all()
    shipment = dispatch_orders(
        db,
        user,
        payload.order_ids,
        shipment_number=payload.shipment_number,
        transport=payload.transport,
        departure_at=parse_dt(payload.departure_at),
        note=payload.note,
    )
    ids = client_ids(orders)
    db.commit()
    after_commit_refresh(ids)
    return {"shipment_number": shipment.shipment_number, "count": len(payload.order_ids)}


@router.post("/transition")
def transition(payload: TransitionIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    orders = db.query(Order).filter(Order.id.in_(payload.order_ids)).all()
    if len(orders) != len(set(payload.order_ids)):
        raise HTTPException(status_code=404, detail="order_not_found")
    for order in orders:
        apply_status(
            db,
            user,
            order,
            payload.to_status,
            note=payload.note,
            reason=payload.reason,
            substatus=payload.delivery_substatus,
        )
        if payload.pickup_point:
            order.pickup_point = payload.pickup_point
        if payload.courier_contact:
            order.courier_contact = payload.courier_contact
        if payload.eta_text:
            order.eta_text = payload.eta_text
    db.commit()
    after_commit_refresh(client_ids(orders))
    return {"ok": True, "count": len(orders)}


@router.post("/orders/{order_id}/correct")
def correct(order_id: int, payload: CorrectIn, user: User = Depends(super_user), db: Session = Depends(get_db)):
    if not payload.reason.strip():
        raise HTTPException(status_code=400, detail="reason_required")
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="order_not_found")
    apply_status(db, user, order, payload.to_status, note=payload.note, reason=payload.reason.strip())
    db.commit()
    after_commit_refresh({order.client_id})
    return order_out(db, order, include_history=True)


@router.post("/import")
def import_file(upload: UploadFile = File(...), user: User = Depends(staff_user), db: Session = Depends(get_db)):
    result = import_orders(db, user, read_table(upload))
    db.commit()
    return result


@router.get("/shipments")
def shipments(user: User = Depends(staff_user), db: Session = Depends(get_db)):
    rows = db.query(Shipment).order_by(Shipment.id.desc()).limit(100).all()
    items = []
    for row in rows:
        count = db.query(Order).filter(Order.shipment_id == row.id).count()
        items.append(
            {
                "id": row.id,
                "shipment_number": row.shipment_number,
                "departure_date": iso(row.departure_date),
                "arrival_date": iso(row.arrival_date),
                "transport": row.transport,
                "status": row.status,
                "note": row.note,
                "order_count": count,
            }
        )
    return {"items": items}


@router.get("/warehouses")
def warehouses(user: User = Depends(staff_user), db: Session = Depends(get_db)):
    rows = db.query(Warehouse).order_by(Warehouse.id.asc()).all()
    return {"items": [warehouse_out(row) for row in rows]}


@router.post("/warehouses")
def add_warehouse(payload: WarehouseIn, user: User = Depends(super_user), db: Session = Depends(get_db)):
    if payload.country not in ("china", "tajikistan"):
        raise HTTPException(status_code=400, detail="country_invalid")
    if payload.is_primary:
        db.query(Warehouse).filter(Warehouse.country == payload.country).update({Warehouse.is_primary: False})
    row = Warehouse(**payload.model_dump())
    db.add(row)
    audit(db, user.id, "warehouse.create", "warehouse", "", "", payload.model_dump(), "")
    db.commit()
    db.refresh(row)
    return warehouse_out(row)


@router.patch("/warehouses/{warehouse_id}")
def patch_warehouse(warehouse_id: int, payload: WarehouseIn, user: User = Depends(super_user), db: Session = Depends(get_db)):
    row = db.get(Warehouse, warehouse_id)
    if row is None:
        raise HTTPException(status_code=404, detail="not_found")
    if payload.is_primary:
        db.query(Warehouse).filter(Warehouse.country == payload.country, Warehouse.id != row.id).update({Warehouse.is_primary: False})
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    audit(db, user.id, "warehouse.update", "warehouse", row.id, "", payload.model_dump(), "")
    db.commit()
    return warehouse_out(row)


@router.get("/branches")
def branches(user: User = Depends(staff_user), db: Session = Depends(get_db)):
    rows = db.query(Branch).order_by(Branch.name.asc()).all()
    return {"items": [branch_out(row) for row in rows]}


@router.post("/branches")
def add_branch(payload: BranchIn, user: User = Depends(super_user), db: Session = Depends(get_db)):
    row = Branch(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    audit(db, user.id, "branch.create", "branch", row.id, "", payload.model_dump(), "")
    db.commit()
    return branch_out(row)


@router.patch("/branches/{branch_id}")
def patch_branch(branch_id: int, payload: BranchIn, user: User = Depends(super_user), db: Session = Depends(get_db)):
    row = db.get(Branch, branch_id)
    if row is None:
        raise HTTPException(status_code=404, detail="not_found")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    audit(db, user.id, "branch.update", "branch", row.id, "", payload.model_dump(), "")
    db.commit()
    return branch_out(row)


@router.get("/tariffs")
def tariffs(user: User = Depends(staff_user), db: Session = Depends(get_db)):
    rows = db.query(Tariff).order_by(Tariff.id.desc()).all()
    return {"items": [tariff_out(row) for row in rows]}


@router.post("/tariffs")
def add_tariff(payload: TariffIn, user: User = Depends(super_user), db: Session = Depends(get_db)):
    row = Tariff(
        category=payload.category.strip(),
        price_per_kg=payload.price_per_kg,
        currency=(payload.currency or "USD").strip() or "USD",
        min_weight=payload.min_weight,
        conditions=payload.conditions,
        effective_from=parse_dt(payload.effective_from) or utcnow(),
        is_active=payload.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    audit(db, user.id, "tariff.create", "tariff", row.id, "", tariff_out(row), "")
    db.commit()
    return tariff_out(row)


@router.patch("/tariffs/{tariff_id}")
def patch_tariff(tariff_id: int, payload: TariffIn, user: User = Depends(super_user), db: Session = Depends(get_db)):
    row = db.get(Tariff, tariff_id)
    if row is None:
        raise HTTPException(status_code=404, detail="not_found")
    row.category = payload.category.strip()
    row.price_per_kg = payload.price_per_kg
    row.currency = payload.currency
    row.min_weight = payload.min_weight
    row.conditions = payload.conditions
    row.effective_from = parse_dt(payload.effective_from) or row.effective_from
    row.is_active = payload.is_active
    audit(db, user.id, "tariff.update", "tariff", row.id, "", tariff_out(row), "")
    db.commit()
    return tariff_out(row)


@router.get("/staff")
def staff(user: User = Depends(super_user), db: Session = Depends(get_db)):
    rows = db.query(User).filter(User.role.in_(tuple(STAFF_CREATABLE))).order_by(User.id.asc()).all()
    return {"items": [user_out(row) for row in rows]}


@router.post("/staff")
def add_staff(payload: StaffIn, user: User = Depends(super_user), db: Session = Depends(get_db)):
    if payload.role not in STAFF_CREATABLE:
        raise HTTPException(status_code=400, detail="role_invalid")
    phone = normalize_phone(payload.phone)
    if db.query(User).filter(User.phone == phone).first():
        raise HTTPException(status_code=409, detail="phone_taken")
    row = User(
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        phone=phone,
        password_hash=hash_password(payload.password),
        role=payload.role,
        language="tj",
    )
    db.add(row)
    db.flush()
    audit(db, user.id, "staff.create", "user", row.id, "", payload.role, "")
    db.commit()
    db.refresh(row)
    return user_out(row)


@router.patch("/staff/{staff_id}")
def patch_staff(staff_id: int, payload: StaffPatch, user: User = Depends(super_user), db: Session = Depends(get_db)):
    row = db.get(User, staff_id)
    if row is None or row.role not in STAFF_CREATABLE:
        raise HTTPException(status_code=404, detail="not_found")
    if payload.role is not None:
        if payload.role not in STAFF_CREATABLE:
            raise HTTPException(status_code=400, detail="role_invalid")
        if row.role == "super_admin" and payload.role != "super_admin":
            others = db.query(User).filter(User.role == "super_admin", User.id != row.id, User.is_blocked.is_(False)).count()
            if others == 0:
                raise HTTPException(status_code=400, detail="last_admin")
        row.role = payload.role
    if payload.first_name is not None:
        row.first_name = payload.first_name.strip()
    if payload.last_name is not None:
        row.last_name = payload.last_name.strip()
    if payload.is_blocked is not None:
        if payload.is_blocked and row.role == "super_admin":
            others = db.query(User).filter(User.role == "super_admin", User.id != row.id, User.is_blocked.is_(False)).count()
            if others == 0:
                raise HTTPException(status_code=400, detail="last_admin")
        row.is_blocked = payload.is_blocked
        if payload.is_blocked:
            row.session_version += 1
    if payload.password:
        if len(payload.password) < 8:
            raise HTTPException(status_code=400, detail="password_short")
        row.password_hash = hash_password(payload.password)
        row.session_version += 1
    audit(db, user.id, "staff.update", "user", row.id, "", row.role, "")
    db.commit()
    return user_out(row)


@router.get("/audit")
def audit_log(user: User = Depends(super_user), db: Session = Depends(get_db)):
    rows = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(200).all()
    users = {item.id: item for item in db.query(User).filter(User.id.in_({row.actor_id for row in rows if row.actor_id})).all()} if rows else {}
    return {
        "items": [
            {
                "id": row.id,
                "action": row.action,
                "entity_type": row.entity_type,
                "entity_id": row.entity_id,
                "old_value": row.old_value,
                "new_value": row.new_value,
                "reason": row.reason,
                "created_at": iso(row.created_at),
                "actor_name": f"{users[row.actor_id].first_name} {users[row.actor_id].last_name}".strip() if row.actor_id in users else "",
                "actor_role": users[row.actor_id].role if row.actor_id in users else "",
            }
            for row in rows
        ]
    }


@router.get("/cms")
def cms(user: User = Depends(super_user), db: Session = Depends(get_db)):
    markets = db.query(MarketplaceLink).order_by(MarketplaceLink.sort_order.asc()).all()
    socials = db.query(SocialLink).all()
    lessons = db.query(Lesson).order_by(Lesson.sort_order.asc()).all()
    banned = db.query(ProhibitedItem).order_by(ProhibitedItem.id.asc()).all()
    return {
        "banner": setting(db, "banner", {}),
        "eta": setting(db, "eta", {}),
        "terms": setting(db, "terms", {}),
        "info_notice": setting(db, "info_notice", {}),
        "marketplaces": [{"id": row.id, "key": row.key, "name": row.name, "url": row.url, "is_active": row.is_active} for row in markets],
        "socials": [{"id": row.id, "key": row.key, "url": row.url, "is_active": row.is_active} for row in socials],
        "lessons": [{"id": row.id, "slug": row.slug, "sort_order": row.sort_order, "title": loads(row.title, {}), "body": loads(row.body, {})} for row in lessons],
        "prohibited": [{"id": row.id, "title": loads(row.title, {}), "note": loads(row.note, {})} for row in banned],
    }


@router.put("/cms")
def save_cms(payload: CmsIn, user: User = Depends(super_user), db: Session = Depends(get_db)):
    for key in ("banner", "eta", "terms", "info_notice"):
        value = getattr(payload, key)
        if value is not None:
            put_setting(db, key, value)
    if payload.marketplaces is not None:
        for item in payload.marketplaces:
            row = db.get(MarketplaceLink, item.get("id"))
            if row is None:
                continue
            row.url = str(item.get("url") or "")
            row.name = str(item.get("name") or row.name)
            row.is_active = bool(item.get("is_active")) and bool(row.url.strip())
    if payload.socials is not None:
        for item in payload.socials:
            row = db.get(SocialLink, item.get("id"))
            if row is None:
                continue
            row.url = str(item.get("url") or "").strip()
            row.is_active = bool(item.get("is_active")) and bool(row.url)
    audit(db, user.id, "cms.update", "settings", "cms", "", "updated", "")
    db.commit()
    return {"ok": True}


@router.post("/lessons")
def add_lesson(payload: TextIn, user: User = Depends(super_user), db: Session = Depends(get_db)):
    row = Lesson(
        slug=payload.slug or f"lesson-{int(utcnow().timestamp())}",
        sort_order=payload.sort_order,
        title=dumps(payload.title),
        body=dumps(payload.body or {}),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id}


@router.patch("/lessons/{lesson_id}")
def patch_lesson(lesson_id: int, payload: TextIn, user: User = Depends(super_user), db: Session = Depends(get_db)):
    row = db.get(Lesson, lesson_id)
    if row is None:
        raise HTTPException(status_code=404, detail="not_found")
    row.title = dumps(payload.title)
    row.body = dumps(payload.body or {})
    row.sort_order = payload.sort_order
    db.commit()
    return {"ok": True}


@router.delete("/lessons/{lesson_id}")
def delete_lesson(lesson_id: int, user: User = Depends(super_user), db: Session = Depends(get_db)):
    row = db.get(Lesson, lesson_id)
    if row is None:
        raise HTTPException(status_code=404, detail="not_found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/prohibited")
def add_prohibited(payload: TextIn, user: User = Depends(super_user), db: Session = Depends(get_db)):
    row = ProhibitedItem(title=dumps(payload.title), note=dumps(payload.note or {}))
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id}


@router.delete("/prohibited/{item_id}")
def delete_prohibited(item_id: int, user: User = Depends(super_user), db: Session = Depends(get_db)):
    row = db.get(ProhibitedItem, item_id)
    if row is None:
        raise HTTPException(status_code=404, detail="not_found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/qr/verify")
def verify_qr(payload: TokenIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    if user.role not in ("super_admin", "warehouse_tajikistan"):
        raise HTTPException(status_code=403, detail="forbidden")
    token = find_token(db, payload.token)
    order = db.get(Order, token.order_id)
    return {"valid": True, "order": order_out(db, order)}


@router.post("/qr/confirm")
def confirm_qr(payload: TokenIn, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    if user.role not in ("super_admin", "warehouse_tajikistan"):
        raise HTTPException(status_code=403, detail="forbidden")
    token = find_token(db, payload.token)
    order = db.get(Order, token.order_id)
    if order.current_status != "delivery":
        raise HTTPException(status_code=400, detail="not_ready")
    token.used_at = utcnow()
    apply_status(db, user, order, "received", note=payload.note, confirmation_method="qr")
    db.commit()
    after_commit_refresh({order.client_id})
    return {"ok": True, "order_number": order.order_number}


@router.post("/backup")
def backup(user: User = Depends(super_user)):
    if not DATABASE_URL.startswith("sqlite"):
        return {
            "mode": "postgres",
            "hint": "Use pg_dump with the DATABASE_URL from the server environment. Do not store the dump in the web root.",
        }
    source = Path(DATABASE_URL.removeprefix("sqlite:///"))
    folder = Path(settings.storage_dir) / "backups"
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / f"safi-{utcnow().strftime('%Y%m%d-%H%M%S')}.db"
    shutil.copy2(source, dest)
    return FileResponse(dest, filename=dest.name, media_type="application/octet-stream")
