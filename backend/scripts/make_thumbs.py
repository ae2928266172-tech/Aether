"""一次性给 media 目录里所有商品图生成缩略图（平时打开页面时会自动按需生成，这个脚本只是让第一次打开更快）。

用法：python scripts/make_thumbs.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.media import NAME, SIZES, thumb_path  # noqa: E402
from app.routers.catalog import MEDIA_DIR  # noqa: E402

# 清掉以前没改名成功留下的半成品
for root, _, files in os.walk(os.path.join(MEDIA_DIR, "_thumbs")):
    for f in files:
        if f.endswith(".tmp"):
            os.remove(os.path.join(root, f))
n = made = 0
for name in sorted(os.listdir(MEDIA_DIR)):
    if NAME.match(name):
        for w in SIZES[:2]:
            made += thumb_path(w, name).endswith(".webp")
        n += 1
print(f"已处理 {n} 张图片，生成或已有缩略图 {made} 个（原图本来就小的直接用原图）")
