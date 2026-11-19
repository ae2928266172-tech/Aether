"""图片缩略图与静态文件缓存。

商品图常常是几 MB 的原图，收银页一屏几十张直接解码会卡。这里按需生成小图（webp），存在 media/_thumbs/<宽>/ 下，
以后直接读文件；原图文件名是随机的、不会被改写，所以缩略图和原图都可以让浏览器长期缓存。
"""
import os
import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from .routers.catalog import MEDIA_DIR

router = APIRouter()
SIZES = (160, 320, 640)
NAME = re.compile(r"^[0-9A-Za-z_\-]+\.(png|jpe?g|webp|gif)$")
LONG = "public, max-age=31536000, immutable"


def thumb_path(width: int, name: str) -> str:
    """生成（或复用）缩略图，返回文件路径。原图比目标还小就直接用原图。"""
    if width not in SIZES or not NAME.match(name):
        raise HTTPException(404)
    src = os.path.join(MEDIA_DIR, name)
    if not os.path.isfile(src):
        raise HTTPException(404)
    out_dir = os.path.join(MEDIA_DIR, "_thumbs", str(width))
    out = os.path.join(out_dir, os.path.splitext(name)[0] + ".webp")
    if os.path.isfile(out) and os.path.getmtime(out) >= os.path.getmtime(src):
        return out
    from PIL import Image, ImageOps
    try:
        with Image.open(src) as im:
            if getattr(im, "is_animated", False):
                return src  # 动图不缩，保持会动
            im = ImageOps.exif_transpose(im)
            if im.width <= width:
                return src
            im.thumbnail((width, width * 4))
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
            os.makedirs(out_dir, exist_ok=True)
            tmp = out + ".tmp"
            im.save(tmp, "WEBP", quality=80, method=4)
            os.replace(tmp, out)
    except HTTPException:
        raise
    except Exception:
        return src  # 坏图、不认识的格式：退回原图，不影响页面
    return out


@router.get("/media/t/{width}/{name}")
def thumbnail(width: int, name: str):
    return FileResponse(thumb_path(width, name), headers={"Cache-Control": LONG})


async def cache_headers(request, call_next):
    """上传的图片、第三方库、带 ?v= 版本号的脚本样式长期缓存；页面本身每次都检查更新。"""
    resp = await call_next(request)
    path = request.url.path
    if resp.status_code == 200 and "cache-control" not in resp.headers:
        if path.startswith("/media/") or path.startswith("/web/vendor/") or (
                request.query_params.get("v") and path.endswith((".js", ".css"))):
            resp.headers["Cache-Control"] = LONG
        elif path.startswith("/web/") and (path.endswith("/") or path.endswith(".html")):
            resp.headers["Cache-Control"] = "no-cache"
    return resp
