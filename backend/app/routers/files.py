from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import FileAsset, User
from app.security import get_current_user
from app.services import can_read_file

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("/{file_id}")
def download(file_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    asset = db.get(FileAsset, file_id)
    if asset is None or not can_read_file(db, user, asset):
        raise HTTPException(status_code=404, detail="not_found")
    safe_name = Path(asset.original_name).name.replace('"', "")
    if asset.content is not None:
        return Response(
            content=bytes(asset.content),
            media_type=asset.mime,
            headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
        )
    path = Path(settings.storage_dir) / asset.stored_name
    if not path.exists():
        raise HTTPException(status_code=404, detail="not_found")
    return FileResponse(path, filename=safe_name, media_type=asset.mime)
