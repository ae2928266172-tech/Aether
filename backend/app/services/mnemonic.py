"""助记码：商品名称的拼音首字母，收银台、后台都可以用它搜商品（如“纸杯”→ zb）。"""
import re

try:
    from pypinyin import Style, lazy_pinyin
except ImportError:  # 没装 pypinyin 时只保留名称里的字母和数字
    lazy_pinyin = None


def make_mnemonic(name: str) -> str:
    name = (name or "").strip()
    if not name:
        return ""
    if lazy_pinyin is None:
        return re.sub(r"[^0-9a-z]", "", name.lower())[:50]
    out = []
    # 汉字取拼音首字母；英文、数字原样保留（如 “L短” → lduan 的首字母 ld）；标点、空格去掉
    for part in lazy_pinyin(name, style=Style.FIRST_LETTER, errors=lambda s: list(s)):
        out.append(part.lower())
    return re.sub(r"[^0-9a-z]", "", "".join(out))[:50]
