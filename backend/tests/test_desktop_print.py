"""桌面收银软件：取小票时一并返回 ESC/POS 指令，由软件直接发给本机 POS58。"""
import base64

from test_pos import checkout


def test_print_returns_escpos_for_desktop(world):
    w, clerk = world, world["clerk"]
    o = clerk.post("/api/pos/checkout", checkout(clerk, w, [{"sku_id": w["big"]["id"], "qty": 2}]))
    # 网页版不带 escpos，返回内容不变
    r = clerk.post(f"/api/orders/{o['id']}/print", {})
    assert "escpos" not in r and r["items"]
    # 桌面软件：同一份小票内容 + ESC/POS 字节
    r = clerk.post(f"/api/orders/{o['id']}/print", {"reprint": True, "escpos": True})
    data = base64.b64decode(r["escpos"])
    assert data.startswith(b"\x1b@") and o["no"].encode() in data
    assert "杯装水".encode("gb18030") in data and "【补打】".encode("gb18030") in data
    logs = [l["action"] for l in clerk.get(f"/api/orders/{o['id']}")["logs"]]
    assert logs.count("打印小票") == 1 and logs.count("补打小票") == 1

