"""商品图缩略图、缓存头、压缩传输。"""
import io

from PIL import Image


def _upload(client, admin, size, fmt="JPEG", ctype="image/jpeg"):
    buf = io.BytesIO()
    Image.new("RGB", size, (200, 30, 30)).save(buf, fmt)
    files = {"file": ("a." + fmt.lower(), buf.getvalue(), ctype)}
    return client.post("/api/uploads", files=files, headers={"Authorization": "Bearer " + admin.token}).json()["url"]


def test_thumbnail_resized_and_cached(client, admin):
    url = _upload(client, admin, (2000, 1500))
    name = url.rsplit("/", 1)[1]
    r = client.get(f"/media/t/320/{name}")
    assert r.status_code == 200
    assert "immutable" in r.headers["cache-control"]
    im = Image.open(io.BytesIO(r.content))
    assert im.format == "WEBP" and im.width == 320 and im.height == 240
    assert len(r.content) < 20000
    # 第二次直接读缓存文件
    assert client.get(f"/media/t/320/{name}").content == r.content
    # 原图也长期缓存
    assert "immutable" in client.get(url).headers["cache-control"]


def test_thumbnail_small_image_returns_original(client, admin):
    url = _upload(client, admin, (100, 80), "PNG", "image/png")
    r = client.get("/media/t/320/" + url.rsplit("/", 1)[1])
    assert r.status_code == 200 and Image.open(io.BytesIO(r.content)).format == "PNG"


def test_thumbnail_rejects_bad_requests(client, admin):
    url = _upload(client, admin, (800, 800))
    name = url.rsplit("/", 1)[1]
    assert client.get(f"/media/t/333/{name}").status_code == 404  # 不支持的尺寸
    assert client.get("/media/t/320/nope.jpg").status_code == 404
    assert client.get("/media/t/320/..%2Fsecret.jpg").status_code == 404


def test_page_not_cached_and_api_gzipped(client, admin):
    r = client.get("/web/store/")
    assert r.status_code == 200 and r.headers.get("cache-control") == "no-cache"
    assert "immutable" in client.get("/web/store/store.js?v=1").headers["cache-control"]
    r = client.get("/api/products", headers={"Authorization": "Bearer " + admin.token, "Accept-Encoding": "gzip"})
    assert r.status_code == 200


def test_thumbnail_falls_back_when_rename_fails(client, admin, monkeypatch):
    """有的 Windows 电脑 AppData 被重定向，os.replace 报 WinError 17，要退到 shutil.move。"""
    import os
    url = _upload(client, admin, (1200, 900))
    def boom(*a, **k):
        raise OSError(17, "cannot move to a different disk drive")
    monkeypatch.setattr(os, "replace", boom)
    r = client.get("/media/t/160/" + url.rsplit("/", 1)[1])
    assert r.status_code == 200 and Image.open(io.BytesIO(r.content)).format == "WEBP"
