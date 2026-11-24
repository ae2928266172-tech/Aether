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


SIZES = {"s": b"\x00", "m": b"\x01", "l": b"\x11"}  # 正常 / 加高 / 宽高都放大
ALIGNS = {"left": b"\x00", "center": b"\x01", "right": b"\x02"}
SPACING = {"compact": ESC + b"3\x18", "normal": ESC + b"2", "loose": ESC + b"3\x50"}


def build(r: dict) -> bytes:
    """r 为 services.receipt.build_receipt 的返回值，按其中 style 排版。"""
    from .receipt import DEFAULT_STYLE
    st = {**DEFAULT_STYLE, **(r.get("style") or {})}
    width = 32 if r.get("paper_width", 58) == 58 else 48
    dots = 384 if width == 32 else 576

    def size(key):  # 返回（指令，该字号下每行可容纳的半角字符数）
        s = st.get(key, "s")
        return GS + b"!" + SIZES.get(s, b"\x00"), (width // 2 if s == "l" else width)

    def align(a):
        return ESC + b"a" + ALIGNS.get(a, b"\x00")

    def block(texts, size_key, bold=False, al="left"):
        cmd, w = size(size_key)
        out = bytearray(align(al) + cmd + (BOLD_ON if bold else b""))
        for t in texts:
            for part in wrap(t, w):
                out += line(part)
        out += SIZE_NORMAL + BOLD_OFF + LEFT
        return bytes(out)

    def lr(left, right, size_key, bold=False):
        cmd, w = size(size_key)
        return cmd + (BOLD_ON if bold else b"") + line(_lr(left, right, w)) + SIZE_NORMAL + BOLD_OFF

    sep_char = (st.get("separator") or "-")[:1]
    sep = line(sep_char * width)
    one = bytearray(INIT + SPACING.get(st.get("line_spacing"), b""))
    one += b"\n" * int(st.get("top_blank", 0))
    if r.get("title"):
        one += block([r["title"]], "title_size", st.get("title_bold"), st.get("title_align", "center"))
    if r.get("store_line"):
        one += block([r["store_line"]], "store_size", st.get("store_bold"), st.get("title_align", "center"))
    if r.get("header_lines"):
        one += block(r["header_lines"], "header_size", False, st.get("header_align", "center"))
    if not r.get("title") and not r.get("store_line") and not r.get("header_lines") and r.get("head"):
        one += block(r["head"], "header_size", False, "center")  # 兼容旧结构
    one += sep
    for row in r["info"]:
        k, v = row[0], row[1]
        if not k:  # 【补打】
            one += block([v], "info_size", True, "center")
        elif len(row) > 2 and row[2] == "big":  # 区域 / 位置（床号）加大加粗，方便找床
            one += block([f"{k}：{v}"], "area_size", st.get("area_bold", True))
        else:
            one += block([f"{k}：{v}"], "info_size")
    one += sep
    for it in r["items"]:
        one += block([it["name"]], "item_size", st.get("item_bold"))
        left = f"  {it['qty']}{it['unit']}" + (f" x {it['unit_price']}" if it.get("unit_price") else "")
        one += lr(left, it["amount"], "item_size")
        if it.get("medical"):
            one += block([f"  {k}：{v}" for k, v in it["medical"]], "medical_size")
        if it.get("refunded_qty"):
            one += line(f"  已退 {it['refunded_qty']}")
    one += sep
    for k, v in r["totals"]:
        if k == "应收":
            one += lr(k, v, "total_size", st.get("total_bold"))
        else:
            one += line(_lr(k, v, width))
    if r.get("remark"):
        one += block(["备注：" + r["remark"]], "info_size")
    one += sep
    if r.get("footer"):
        one += block(r["footer"], "footer_size", False, st.get("footer_align", "center"))
    img = r.get("footer_image") or ""
    if img.startswith("/media/"):
        pct = max(20, min(100, int(st.get("image_width", 60))))
        one += align(st.get("footer_align", "center"))
        one += raster(os.path.join(_media_dir(), os.path.basename(img)), int(dots * pct / 100))
        one += b"\n" + LEFT
    one += ESC + b"d" + bytes([max(0, min(10, int(st.get("bottom_blank", 4))))]) + GS + b"V\x42\x00"
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
