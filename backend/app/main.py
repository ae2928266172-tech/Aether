"""收银系统后端入口。

启动：uvicorn app.main:app --host 0.0.0.0 --port 8000
网页：/admin 后台管理，/store 门店工作台，/h5 顾客点单（小程序上线前的网页版）
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError

from . import db as dbmod
from . import media
from .routers import auth, catalog, customer, orders, print_agent, reports, requisitions, settings, shifts, stores
from .seed import init_db

WEB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "web")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(dbmod.engine, dbmod.SessionLocal)
    yield


app = FastAPI(title="收银系统 API", version="0.1.0", lifespan=lifespan)
# 局域网 / 云服务器上传输更快：接口 JSON、脚本、样式压缩后发送
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.middleware("http")(media.cache_headers)


class MarkWrites:
    """标记这个请求会不会写库，供 db.py 决定 SQLite 事务是否一开始就拿写锁。"""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            dbmod.writing.set(scope["method"] not in ("GET", "HEAD", "OPTIONS"))
        await self.app(scope, receive, send)


app.add_middleware(MarkWrites)
app.include_router(media.router)  # 缩略图要排在 /media 静态目录前面

for r in (auth, catalog, stores, orders, customer, reports, settings, print_agent, requisitions, shifts):
    app.include_router(r.router)


@app.exception_handler(IntegrityError)
async def integrity(_: Request, exc: IntegrityError):
    return JSONResponse(status_code=409, content={"detail": "数据重复或关联数据不存在，请刷新后重试"})


@app.get("/api/health")
def health():
    return {"ok": True}


os.makedirs(catalog.MEDIA_DIR, exist_ok=True)
app.mount("/media", StaticFiles(directory=catalog.MEDIA_DIR), name="media")
if os.path.isdir(WEB_DIR):
    app.mount("/web", StaticFiles(directory=WEB_DIR, html=True), name="web")


@app.get("/")
def index():
    return RedirectResponse("/web/admin/")
