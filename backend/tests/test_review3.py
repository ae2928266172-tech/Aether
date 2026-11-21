"""2026-11-21 第三份代码审查后补的回归测试。"""


def test_close_shift_checks_store_access(admin, world):
    """收银员被调离门店后，不能再交那家门店的班（交班看的是那家店的收款）。"""
    w, clerk = world, world["clerk"]
    s = clerk.post("/api/shifts/open", {"store_id": w["s1"]["id"], "opening_cash": 10000})
    uid = s["user_id"]
    admin.put(f"/api/users/{uid}", {"username": "clerk1", "display_name": "店员甲", "role_id": w["store_role"]["id"],
                                    "store_ids": [w["s2"]["id"]]})
    clerk.post(f"/api/shifts/{s['id']}/close", {"counted_cash": 10000}, expect=403)
    # 后台管理员可以替他交
    r = admin.post(f"/api/shifts/{s['id']}/close", {"counted_cash": 10000})
    assert r["status"] == "closed" and r["cash_diff"] == 0


def test_open_shift_twice_returns_same(admin, world):
    w, clerk = world, world["clerk"]
    a = clerk.post("/api/shifts/open", {"store_id": w["s1"]["id"], "opening_cash": 5000})
    b = clerk.post("/api/shifts/open", {"store_id": w["s1"]["id"], "opening_cash": 5000})
    assert a["id"] == b["id"]


def test_login_fail_map_is_bounded(client):
    """拿大量随机账号名乱试，内存里的失败记录不会无限变大。"""
    from app.routers import auth
    old = auth.FAIL_MAX_KEYS
    auth.FAIL_MAX_KEYS = 20
    auth._FAILS.clear()
    try:
        for i in range(60):
            r = client.post("/api/auth/login", json={"username": f"nobody{i}", "password": "x"})
            assert r.status_code == 400
        assert len(auth._FAILS) <= 20
        # 被限次的账号照样被锁
        for _ in range(5):
            client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
        assert client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).status_code == 429
    finally:
        auth.FAIL_MAX_KEYS = old
        auth._FAILS.clear()


def test_empty_username_rejected(admin, world):
    role = world["store_role"]["id"]
    for name in ("", "   "):
        admin.post("/api/users", {"username": name, "role_id": role, "password": "abcdef"}, expect=422)
    r = admin.c.post("/api/auth/login", json={"username": "  ", "password": "x"})
    assert r.status_code == 400


def test_bad_token_subject_is_401(client):
    """签名对但 sub 不是数字的令牌：返回 401，不是 500。"""
    from app.security import make_token
    for kind in ("staff", "customer"):
        t = make_token("abc", kind)
        r = client.get("/api/auth/me" if kind == "staff" else "/api/customer/orders",
                       headers={"Authorization": "Bearer " + t})
        assert r.status_code == 401, (kind, r.status_code)


def test_secret_key_file_private(tmp_path, monkeypatch):
    import os, stat
    if os.name == "nt":
        return
    monkeypatch.delenv("SHOUYIN_SECRET", raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    from app import security
    s = security._secret()
    assert len(s) == 64
    mode = stat.S_IMODE(os.stat(tmp_path / "shouyin" / "secret.key").st_mode)
    assert mode == 0o600, oct(mode)
