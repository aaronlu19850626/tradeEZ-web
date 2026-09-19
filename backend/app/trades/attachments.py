import hashlib
import io
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from PIL import Image, ImageOps, UnidentifiedImageError

from ..db import get_db
from ..security import get_current_user

router = APIRouter(tags=["review-attachments"])
MAX_SIZE = 5 * 1024 * 1024
MAX_PIXELS = 16_000_000
META = "id,review_id,size,width,height,created_at"


def owned_review(db, user_id, review_id):
    row = db.execute("SELECT r.* FROM trade_reviews r JOIN accounts a ON a.id=r.account_id WHERE r.id=? AND a.user_id=?", (review_id, user_id)).fetchone()
    if row is None:
        raise HTTPException(404, "复盘不存在，请先保存复盘")
    return row


def normalize(raw):
    try:
        with Image.open(io.BytesIO(raw)) as source:
            if source.format not in ("PNG", "JPEG", "WEBP") or getattr(source, "n_frames", 1) != 1:
                raise HTTPException(400, "仅支持静态 PNG、JPEG、WebP 图片")
            if source.width * source.height > MAX_PIXELS:
                raise HTTPException(400, "图片不能超过 1600 万像素")
            source.load()
            # Re-encode pixel data only; discard embedded metadata and trailing payloads.
            oriented = ImageOps.exif_transpose(source).convert("RGBA")
            clean = Image.new("RGBA", oriented.size)
            clean.paste(oriented)
            output = io.BytesIO()
            clean.save(output, format="PNG")
            result = output.getvalue()
            if len(result) > MAX_SIZE:
                raise HTTPException(413, "转换后的图片超过 5 MB，请缩小截图")
            return result, clean.width, clean.height
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(400, "图片损坏或格式不支持")


def store(db, user_id, review_id, raw):
    data, width, height = normalize(raw)
    digest = hashlib.sha256(data).hexdigest()
    db.execute("BEGIN IMMEDIATE")
    try:
        review = owned_review(db, user_id, review_id)
        existing = db.execute(f"SELECT {META} FROM review_attachments WHERE review_id=? AND sha256=?", (review_id, digest)).fetchone()
        if existing:
            db.commit()
            return dict(existing)
        if db.execute("SELECT COUNT(*) FROM review_attachments WHERE review_id=?", (review_id,)).fetchone()[0] >= 10:
            raise HTTPException(409, "每份复盘最多 10 张截图")
        used = db.execute("SELECT COALESCE(SUM(f.size),0) FROM review_attachments f JOIN trade_reviews r ON r.id=f.review_id WHERE r.account_id=?", (review["account_id"],)).fetchone()[0]
        if used + len(data) > 100 * 1024 * 1024:
            raise HTTPException(409, "该账户截图容量已达 100 MB，请先整理附件")
        cursor = db.execute("INSERT INTO review_attachments(review_id,data,sha256,size,width,height) VALUES(?,?,?,?,?,?)", (review_id, data, digest, len(data), width, height))
        result = dict(db.execute(f"SELECT {META} FROM review_attachments WHERE id=?", (cursor.lastrowid,)).fetchone())
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


@router.get("/api/v1/my/reviews/{review_id}/attachments")
def list_files(review_id: int, db: sqlite3.Connection = Depends(get_db), user=Depends(get_current_user)):
    owned_review(db, user["id"], review_id)
    return [dict(row) for row in db.execute(f"SELECT {META} FROM review_attachments WHERE review_id=? ORDER BY id", (review_id,))]


@router.post("/api/v1/my/reviews/{review_id}/attachments", status_code=201)
async def upload(review_id: int, request: Request, db: sqlite3.Connection = Depends(get_db), user=Depends(get_current_user)):
    owned_review(db, user["id"], review_id)
    raw = bytearray()
    async for chunk in request.stream():
        if len(raw) + len(chunk) > MAX_SIZE:
            raise HTTPException(413, "单张图片不能超过 5 MB")
        raw.extend(chunk)
    return await run_in_threadpool(store, db, user["id"], review_id, bytes(raw))


def owned_file(db, user_id, file_id):
    row = db.execute("""SELECT f.* FROM review_attachments f JOIN trade_reviews r ON r.id=f.review_id
        JOIN accounts a ON a.id=r.account_id WHERE f.id=? AND a.user_id=?""", (file_id, user_id)).fetchone()
    if row is None:
        raise HTTPException(404, "附件不存在")
    return row


@router.get("/api/v1/my/review-attachments/{file_id}")
def content(file_id: int, db: sqlite3.Connection = Depends(get_db), user=Depends(get_current_user)):
    row = owned_file(db, user["id"], file_id)
    return Response(row["data"], media_type="image/png", headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": f'inline; filename="review-{file_id}.png"'})


@router.delete("/api/v1/my/review-attachments/{file_id}")
def delete(file_id: int, db: sqlite3.Connection = Depends(get_db), user=Depends(get_current_user)):
    db.execute("BEGIN IMMEDIATE")
    try:
        owned_file(db, user["id"], file_id)
        db.execute("DELETE FROM review_attachments WHERE id=?", (file_id,))
        db.commit()
        return {"message": "截图已删除"}
    except Exception:
        db.rollback()
        raise
