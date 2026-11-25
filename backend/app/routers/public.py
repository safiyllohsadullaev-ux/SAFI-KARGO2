from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Branch, MarketplaceLink, SocialLink
from app.services import branch_out, setting

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/branches")
def branches(db: Session = Depends(get_db)):
    rows = db.query(Branch).filter(Branch.is_active.is_(True)).order_by(Branch.name.asc()).all()
    return {"items": [branch_out(row) for row in rows]}


@router.get("/bootstrap")
def bootstrap(db: Session = Depends(get_db)):
    markets = (
        db.query(MarketplaceLink)
        .filter(MarketplaceLink.is_active.is_(True), MarketplaceLink.url != "")
        .order_by(MarketplaceLink.sort_order.asc())
        .all()
    )
    socials = (
        db.query(SocialLink)
        .filter(SocialLink.is_active.is_(True), SocialLink.url != "")
        .all()
    )
    return {
        "banner": setting(db, "banner", {}),
        "marketplaces": [{"key": row.key, "name": row.name, "url": row.url} for row in markets],
        "socials": [{"key": row.key, "url": row.url} for row in socials],
        "sms_configured": False,
    }
