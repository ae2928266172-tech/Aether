"""把小票内容转成 ESC/POS 指令，供“打印小助手”原样发给 58mm / 80mm 热敏小票机（如 POS58）。

中文用 GB18030 编码（国产小票机默认字库）；底部图片转成黑白点阵（GS v 0）；最后走纸并切纸（无切刀的机器会忽略）。
"""
import os

from .receipt import _lr, _w

ESC, GS, FS = b"\x1b", b"\x1d", b"\x1c"
INIT = ESC + b"@" + FS + b"&"  # 初始化 + 进入汉字模式
LEFT, CENTER = ESC + b"a\x00", ESC + b"a\x01"
BOLD_ON, BOLD_OFF = ESC + b"E\x01", ESC + b"E\x00"
SIZE_NORMAL, SIZE_DOUBLE, SIZE_TALL = GS + b"!\x00", GS + b"!\x11", GS + b"!\x01"
CUT = ESC + b"d\x04" + GS + b"V\x42\x00"


def _media_dir() -> str:
    return os.environ.get("SHOUYIN_MEDIA") or os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media")


def enc(s: str) -> bytes:
    return s.encode("gb18030", errors="replace")


def line(s: str = "") -> bytes:
    return enc(s) + b"\n"


def wrap(s: str, width: int) -> list[str]:
    out, cur = [], ""
    for ch in s:
        if _w(cur + ch) > width:
            out.append(cur)
            cur = ch
        else:
            cur += ch
    if cur or not out:
        out.append(cur)
    return out


def raster(path: str, dots: int) -> bytes:
    """图片转点阵。dots 为打印宽度（点），58mm 纸 384 点。"""
    try:
        from PIL import Image
    except ImportError:
        return b""
    try:
        img = Image.open(path)
    except Exception:
        return b""
    img = img.convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    bg.alpha_composite(img)
    img = bg.convert("L")
    w = min(dots, img.width) if img.width < dots // 2 else dots
    h = max(1, round(img.height * w / img.width))
    img = img.resize((w, h)).point(lambda p: 0 if p < 140 else 255, "1")
    wb = (w + 7) // 8
    data = bytearray()
    px = img.load()
    rows = []
    for y in range(h):
        row = bytearray(wb)
        for x in range(w):
            if px[x, y] == 0:
                row[x // 8] |= 0x80 >> (x % 8)
        rows.append(bytes(row))
    # 分段发送，避免小票机缓冲区不够
    for start in range(0, h, 128):
        chunk = rows[start:start + 128]
        n = len(chunk)
        data += GS + b"v0\x00" + bytes([wb % 256, wb // 256, n % 256, n // 256]) + b"".join(chunk)
    return bytes(data)


def build(r: dict) -> bytes:
    """r 为 services.receipt.build_receipt 的返回值。"""
    width = 32 if r.get("paper_width", 58) == 58 else 48
    dots = 384 if width == 32 else 576
    sep = line("-" * width)
    one = bytearray(INIT)
    one += CENTER
    for i, h in enumerate(r["head"]):
        if i == 0:
            one += SIZE_DOUBLE + BOLD_ON
            for part in wrap(h, width // 2):
                one += line(part)
            one += SIZE_NORMAL + BOLD_OFF
        else:
            for part in wrap(h, width):
                one += line(part)
    one += LEFT + sep
    for k, v in r["info"]:
        text = f"{k}：{v}" if k else v
        if not k:  # 【补打】
            one += CENTER + BOLD_ON + line(text) + BOLD_OFF + LEFT
            continue
        for part in wrap(text, width):
            one += line(part)
    one += sep
    for it in r["items"]:
        one += BOLD_ON
        for part in wrap(it["name"], width):
            one += line(part)
        one += BOLD_OFF
        left = f"  {it['qty']}{it['unit']}" + (f" x {it['unit_price']}" if it.get("unit_price") else "")
        one += line(_lr(left, it["amount"], width))
        for k, v in it.get("medical", []):
            for part in wrap(f"  {k}：{v}", width):
                one += line(part)
        if it.get("refunded_qty"):
            one += line(f"  已退 {it['refunded_qty']}")
    one += sep
    for k, v in r["totals"]:
        if k == "应收":
            one += BOLD_ON + SIZE_TALL + line(_lr(k, v, width)) + SIZE_NORMAL + BOLD_OFF
        else:
            one += line(_lr(k, v, width))
    if r.get("remark"):
        for part in wrap("备注：" + r["remark"], width):
            one += line(part)
    one += sep + CENTER
    for f in r["footer"]:
        for part in wrap(f, width):
            one += line(part)
    img = r.get("footer_image") or ""
    if img.startswith("/media/"):
        one += raster(os.path.join(_media_dir(), os.path.basename(img)), int(dots * 0.6))
        one += b"\n"
    one += LEFT + CUT
    return bytes(one) * max(1, int(r.get("copies", 1)))


def test_page(store_name: str, paper_width: int = 58) -> bytes:
    width = 32 if paper_width == 58 else 48
    out = bytearray(INIT + CENTER + SIZE_DOUBLE + BOLD_ON)
    out += line("打印测试")
    out += SIZE_NORMAL + BOLD_OFF + line(store_name) + LEFT + line("-" * width)
    out += line("中文：收银系统小票机连接正常")
    out += line(_lr("左对齐", "右对齐", width))
    out += line("1234567890" * (width // 10))
    out += line("-" * width) + CENTER + line("如果文字清楚、没有乱码，就设置好了") + LEFT + CUT
    return bytes(out)
