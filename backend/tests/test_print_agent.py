from conftest import customer


def _agent_mode(admin, w, **kw):
    s = w["s1"]
    admin.put(f"/api/stores/{s['id']}", {"name": s["name"], "print_mode": "agent", **kw})
    return admin.post(f"/api/stores/{s['id']}/printer/key")["print_key"]


def _next(client, key):
    return client.get("/api/print-agent/next", params={"key": key})


def test_agent_queue_flow(client, admin, world):
    w, clerk = world, world["clerk"]
    key = _agent_mode(admin, w)
    assert _next(client, key).status_code == 204
    assert client.get("/api/print-agent/next", params={"key": "bad"}).status_code == 401

    # 小程序新订单自动进队列，取到的是该订单的 ESC/POS 内容，并要求响铃
    c = customer(client)
    o = c.post("/api/customer/orders", {"area_code": w["a1"]["code"], "location_note": "24床",
                                        "lines": [{"sku_id": w["big"]["id"], "qty": 2}]})
    r = _next(client, key)
    assert r.status_code == 200 and r.headers["x-job-kind"] == "new_order" and r.headers["x-beep"] == "1"
    data = r.content
    assert data.startswith(b"\x1b@") and o["no"].encode() in data and "24床".encode("gb18030") in data
    assert "杯装水".encode("gb18030") in data and data.rstrip(b"\x00").endswith(b"\x1dVB")
    job_id = r.headers["x-job-id"]
    # 回报完成前，短时间内不会重复发
    assert _next(client, key).status_code == 204
    client.post(f"/api/print-agent/done/{job_id}", params={"key": key})

    # 门店补打 → 进队列，不在浏览器打印
    p = clerk.post(f"/api/orders/{o['id']}/print", {"reprint": True})
    assert p["queued"]
    r = _next(client, key)
    assert r.headers["x-job-kind"] == "reprint" and "【补打】".encode("gb18030") in r.content
    client.post(f"/api/print-agent/done/{r.headers['x-job-id']}", params={"key": key})
    logs = [l["action"] for l in clerk.get(f"/api/orders/{o['id']}")["logs"]]
    assert logs.count("打印小票") == 1 and logs.count("补打小票") == 1

    # 收银后自动出票；关掉后不出
    clerk.post("/api/pos/checkout", {"store_id": w["s1"]["id"], "lines": [{"sku_id": w["small"]["id"], "qty": 1}],
                                     "payments": [{"method": "cash", "amount": 1000}]})
    r = _next(client, key)
    assert r.headers["x-job-kind"] == "pos" and r.headers["x-beep"] == "0"
    client.post(f"/api/print-agent/done/{r.headers['x-job-id']}", params={"key": key})
    _agent_mode(admin, w, auto_print_pos=False)
    key = admin.get(f"/api/stores/{w['s1']['id']}/printer")["print_key"]
    clerk.post("/api/pos/checkout", {"store_id": w["s1"]["id"], "lines": [{"sku_id": w["small"]["id"], "qty": 1}],
                                     "payments": [{"method": "cash", "amount": 1000}]})
    assert _next(client, key).status_code == 204


def test_test_page_and_status(client, admin, world):
    w = world
    sid = w["s1"]["id"]
    admin.post(f"/api/stores/{sid}/printer/test", expect=400)  # 还是浏览器出票模式
    key = _agent_mode(admin, w)
    st = admin.post(f"/api/stores/{sid}/printer/test")
    assert st["has_pending"]
    r = _next(client, key)
    assert r.headers["x-job-kind"] == "test" and "打印测试".encode("gb18030") in r.content
    st = admin.get(f"/api/stores/{sid}/printer")
    assert st["agent_online"] and st["print_key"] == key
    # 换新密钥后旧密钥失效
    admin.post(f"/api/stores/{sid}/printer/key")
    assert _next(client, key).status_code == 401
    # 门店员工看不到密钥
    w["clerk"].get(f"/api/stores/{sid}/printer", expect=403)


def test_receipt_style(client, admin, world):
    key = _agent_mode(admin, world)
    admin.put("/api/settings/receipt", {"title": "我的小店", "title_size": "s", "item_size": "l", "footer_align": "right",
                                        "footer": "谢谢", "separator": "=", "line_spacing": "loose", "bottom_blank": 6})
    admin.put("/api/settings/receipt", {"title_size": "huge"}, expect=400)
    admin.put("/api/settings/receipt", {"image_width": 5}, expect=400)
    c = customer(client)
    c.post("/api/customer/orders", {"area_code": world["a1"]["code"], "location_note": "1",
                                    "lines": [{"sku_id": world["small"]["id"], "qty": 1}]})
    data = _next(client, key).content
    title = "我的小店".encode("gb18030")
    i = data.index(title)
    assert data[i - 6:i].endswith(b"\x1d!\x00\x1bE\x01")          # 标题：正常字号、加粗
    j = data.index("杯装水".encode("gb18030"))
    assert b"\x1d!\x11" in data[j - 8:j]                              # 商品名：加大
    a = data.index("病区：一病区".encode("gb18030"))
    assert data[a - 6:a].endswith(b"\x1d!\x11\x1bE\x01")             # 区域 / 床号：加大加粗
    k = data.index("谢谢".encode("gb18030"))
    assert b"\x1ba\x02" in data[k - 8:k]                              # 底部文字：右对齐
    assert b"=" * 32 in data and b"\x1b3\x50" in data and b"\x1bd\x06\x1dVB\x00" in data
    pv = admin.post("/api/settings/receipt/preview", {"item_size": "m"})
    assert pv["style"]["item_size"] == "m" and pv["title"] == "我的小店"


def test_download_agent(client):
    import io
    import zipfile
    r = client.get("/api/print-agent/download")
    assert r.status_code == 200
    names = [i.filename.encode("cp437").decode("gbk") if not (i.flag_bits & 0x800) else i.filename
             for i in zipfile.ZipFile(io.BytesIO(r.content)).infolist()]
    assert "print-agent.ps1" in names and "安装打印小助手.bat" in names


def test_footer_image_raster(client, admin, world, tmp_path):
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (200, 200), "black").save(buf, "PNG")
    files = {"file": ("qr.png", buf.getvalue(), "image/png")}
    up = client.post("/api/uploads", files=files, headers={"Authorization": "Bearer " + admin.token}).json()
    admin.put("/api/settings/receipt", {"footer_image": up["url"]})
    key = _agent_mode(admin, world)
    c = customer(client)
    c.post("/api/customer/orders", {"area_code": world["a1"]["code"], "location_note": "1",
                                    "lines": [{"sku_id": world["small"]["id"], "qty": 1}]})
    data = _next(client, key).content
    assert b"\x1dv0\x00" in data  # 点阵图片指令
