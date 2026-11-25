from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Branch, Lesson, MarketplaceLink, Notification, Order, ProhibitedItem, SocialLink, Tariff, User
from app.security import get_current_user
from app.services import (
    active_tariffs,
    after_commit_refresh,
    branch_out,
    check_address,
    client_stats,
    issue_pickup_token,
    loads,
    order_out,
    primary_china_warehouse,
    quote,
    setting,
    status_counts,
    tariff_out,
    warehouse_out,
)

router = APIRouter(prefix="/api/client", tags=["client"])


def require_client(user: User = Depends(get_current_user)) -> User:
    if user.role != "client":
        raise HTTPException(status_code=403, detail="forbidden")
    return user


class AddressIn(BaseModel):
    text: str = ""


class QuoteIn(BaseModel):
    weight: float = Field(gt=0)
    tariff_id: int


@router.get("/home")
def home(user: User = Depends(require_client), db: Session = Depends(get_db)):
    branch = db.get(Branch, user.branch_id) if user.branch_id else None
    warehouse = primary_china_warehouse(db)
    markets = (
        db.query(MarketplaceLink)
        .filter(MarketplaceLink.is_active.is_(True), MarketplaceLink.url != "")
        .order_by(MarketplaceLink.sort_order.asc())
        .all()
    )
    socials = db.query(SocialLink).filter(SocialLink.is_active.is_(True), SocialLink.url != "").all()
    warehouse_payload = None
    if warehouse:
        warehouse_payload = warehouse_out(warehouse)
        warehouse_payload["client_code"] = user.public_client_id
    return {
        "user": {
            "public_client_id": user.public_client_id,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "phone": user.phone,
        },
        "branch": branch_out(branch),
        "tariffs": [tariff_out(row) for row in active_tariffs(db)],
        "eta": setting(db, "eta", {"tj": "", "ru": "", "en": ""}),
        "banner": setting(db, "banner", {}),
        "info_notice": setting(db, "info_notice", {"tj": "", "ru": "", "en": ""}),
        "warehouse": warehouse_payload,
        "marketplaces": [{"key": row.key, "name": row.name, "url": row.url} for row in markets],
        "socials": [{"key": row.key, "url": row.url} for row in socials],
        "counts": status_counts(db, user.id),
    }


@router.get("/orders")
def orders(
    status: str | None = None,
    user: User = Depends(require_client),
    db: Session = Depends(get_db),
):
    query = db.query(Order).filter(Order.client_id == user.id)
    if status:
        if status not in status_counts(db).keys() and status not in (
            "china_warehouse",
            "in_transit",
            "tj_warehouse",
            "sorting",
            "delivery",
            "received",
        ):
            raise HTTPException(status_code=400, detail="bad_status")
        query = query.filter(Order.current_status == status)
    rows = query.order_by(Order.updated_at.desc()).all()
    return {"items": [order_out(db, row) for row in rows], "counts": status_counts(db, user.id)}


@router.get("/orders/{order_id}")
def order_detail(order_id: int, user: User = Depends(require_client), db: Session = Depends(get_db)):
    order = db.get(Order, order_id)
    if order is None or order.client_id != user.id:
        raise HTTPException(status_code=404, detail="order_not_found")
    return order_out(db, order, include_history=True)


@router.get("/track")
def track(code: str = Query(min_length=1), user: User = Depends(require_client), db: Session = Depends(get_db)):
    value = code.strip()
    order = (
        db.query(Order)
        .filter(
            Order.client_id == user.id,
            (Order.tracking_number == value) | (Order.order_number == value),
        )
        .order_by(Order.id.desc())
        .first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="order_not_found")
    return order_out(db, order, include_history=True)


@router.get("/qr")
def qr(user: User = Depends(require_client), db: Session = Depends(get_db)):
    ready = (
        db.query(Order)
        .filter(Order.client_id == user.id, Order.current_status == "delivery")
        .order_by(Order.updated_at.desc())
        .all()
    )
    items = []
    for order in ready:
        items.append({**order_out(db, order), "token": issue_pickup_token(db, order)})
    db.commit()
    return {
        "identity": user.public_client_id,
        "ready": items,
    }


@router.get("/notifications")
def notifications(user: User = Depends(require_client), db: Session = Depends(get_db)):
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
        .all()
    )
    return {
        "items": [
            {
                "id": row.id,
                "type": row.type,
                "payload": loads(row.payload, {}),
                "is_read": row.is_read,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]
    }


@router.post("/notifications/read")
def read_notifications(user: User = Depends(require_client), db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.user_id == user.id, Notification.is_read.is_(False)).update(
        {Notification.is_read: True}
    )
    db.commit()
    after_commit_refresh({user.id})
    return {"ok": True}


@router.get("/stats")
def stats(user: User = Depends(require_client), db: Session = Depends(get_db)):
    return client_stats(db, user)


@router.get("/tariffs")
def tariffs(user: User = Depends(require_client), db: Session = Depends(get_db)):
    return {"items": [tariff_out(row) for row in active_tariffs(db)]}


@router.post("/calculator")
def calculator(payload: QuoteIn, user: User = Depends(require_client), db: Session = Depends(get_db)):
    tariff = db.get(Tariff, payload.tariff_id)
    if tariff is None or not tariff.is_active:
        raise HTTPException(status_code=404, detail="tariff_missing")
    return quote(payload.weight, tariff)


@router.post("/address-check")
def address_check(payload: AddressIn, user: User = Depends(require_client), db: Session = Depends(get_db)):
    return check_address(payload.text, primary_china_warehouse(db), user.public_client_id or "")


@router.get("/lessons")
def lessons(user: User = Depends(require_client), db: Session = Depends(get_db)):
    rows = db.query(Lesson).order_by(Lesson.sort_order.asc()).all()
    return {
        "items": [
            {"id": row.id, "slug": row.slug, "title": loads(row.title, {}), "body": loads(row.body, {})}
            for row in rows
        ]
    }


@router.get("/terms")
def terms(user: User = Depends(require_client), db: Session = Depends(get_db)):
    return {"terms": setting(db, "terms", {"tj": "", "ru": "", "en": ""})}


@router.get("/prohibited")
def prohibited(user: User = Depends(require_client), db: Session = Depends(get_db)):
    rows = db.query(ProhibitedItem).order_by(ProhibitedItem.id.asc()).all()
    return {"items": [{"id": row.id, "title": loads(row.title, {}), "note": loads(row.note, {})} for row in rows]}
