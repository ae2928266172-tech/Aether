"""在线收款通道：签名验签、各家返回结果的解读、交易记账（模拟通道）。"""
import base64
import json
import time
from urllib.parse import parse_qsl

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app import db as dbmod
from app.models import PayTxn
from app.services import pay
from app.services.pay import alipay as ali
from app.services.pay import service
from app.services.pay import wechat as wx
from app.services.pay.mock import MockGateway

from conftest import login


def keypair():
    k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv = k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                           serialization.NoEncryption()).decode()
    pub = k.public_key().public_bytes(serialization.Encoding.PEM,
                                      serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    return k, priv, pub


MERCHANT, MERCHANT_PRIV, MERCHANT_PUB = keypair()
PLATFORM, PLATFORM_PRIV, PLATFORM_PUB = keypair()


@pytest.fixture(autouse=True)
def _reset_pay():
    pay.reset()
    hooks = list(service.PAID_HOOKS)
    yield
    pay.reset()
    service.PAID_HOOKS[:] = hooks


def test_detect_provider():
    assert pay.detect_provider("134567890123456789") == "wechat"
    assert pay.detect_provider("286543210987654321") == "alipay"
    assert pay.detect_provider("1234") is None
    assert pay.detect_provider("abc") is None
    assert pay.detect_provider("") is None


# ---------------- 支付宝 ----------------

def alipay_server(handler):
    """假支付宝：核对请求签名，交给 handler 出业务结果，再用“支付宝私钥”给响应签名。"""
    seen = []

    def app(req: httpx.Request):
        params = dict(parse_qsl(req.content.decode()))
        sign = params.pop("sign")
        assert ali.rsa2_verify(ali.load_public_key(MERCHANT_PUB), ali.sign_content(params), sign), "请求签名不对"
        seen.append(params)
        method = params["method"]
        resp = handler(method, json.loads(params["biz_content"]))
        node = json.dumps(resp, ensure_ascii=False, separators=(",", ":"))
        signature = ali.rsa2_sign(PLATFORM, node)
        return httpx.Response(200, text='{"' + method.replace(".", "_") + '_response":' + node + ',"sign":"' + signature + '"}')
    return httpx.MockTransport(app), seen


def alipay_gw(handler):
    transport, seen = alipay_server(handler)
    return ali.AlipayGateway("2021000000000001", MERCHANT_PRIV, PLATFORM_PUB, sandbox=True, transport=transport), seen


def test_alipay_key_without_pem_header():
    body = "".join(MERCHANT_PRIV.strip().splitlines()[1:-1])
    k = ali.load_private_key(body)
    assert ali.rsa2_verify(ali.load_public_key(MERCHANT_PUB), "a=1", ali.rsa2_sign(k, "a=1"))


def test_alipay_micropay_paid_and_amount():
    gw, seen = alipay_gw(lambda m, b: {"code": "10000", "msg": "Success", "out_trade_no": b["out_trade_no"],
                                         "trade_no": "2026112622001", "total_amount": "12.30", "buyer_user_id": "2088"})
    r = gw.micropay("P1", 1230, "286543210987654321", "门店收款")
    assert (r.status, r.trade_no, r.amount, r.payer) == ("paid", "2026112622001", 1230, "2088")
    assert json.loads(seen[0]["biz_content"])["total_amount"] == "12.30"
    assert seen[0]["method"] == "alipay.trade.pay" and gw.gateway == ali.SANDBOX


@pytest.mark.parametrize("code,status", [("10003", "paying"), ("20000", "paying"), ("40004", "failed")])
def test_alipay_micropay_other_codes(code, status):
    gw, _ = alipay_gw(lambda m, b: {"code": code, "msg": "x", "sub_msg": "余额不足"})
    assert gw.micropay("P1", 100, "286543210987654321", "x").status == status


def test_alipay_tampered_response_rejected():
    def app(req):
        return httpx.Response(200, text='{"alipay_trade_pay_response":{"code":"10000","total_amount":"0.01"},"sign":"'
                              + ali.rsa2_sign(MERCHANT, "{}") + '"}')
    gw = ali.AlipayGateway("app", MERCHANT_PRIV, PLATFORM_PUB, transport=httpx.MockTransport(app))
    with pytest.raises(pay.PayError):
        gw.micropay("P1", 1, "286543210987654321", "x")


def test_alipay_unsigned_success_rejected():
    gw = ali.AlipayGateway("app", MERCHANT_PRIV, PLATFORM_PUB, transport=httpx.MockTransport(
        lambda req: httpx.Response(200, text='{"alipay_trade_pay_response":{"code":"10000"}}')))
    with pytest.raises(pay.PayError):
        gw.micropay("P1", 1, "286543210987654321", "x")


def test_alipay_query_states():
    states = iter(["WAIT_BUYER_PAY", "TRADE_SUCCESS", "TRADE_CLOSED"])
    gw, _ = alipay_gw(lambda m, b: {"code": "10000", "trade_status": next(states), "out_trade_no": b["out_trade_no"],
                                     "total_amount": "1.00"})
    assert [gw.query("P1").status for _ in range(3)] == ["paying", "paid", "closed"]
    gw2, _ = alipay_gw(lambda m, b: {"code": "40004", "sub_code": "ACQ.TRADE_NOT_EXIST"})
    assert gw2.query("P1").status == "paying"


def test_alipay_precreate_and_refund():
    def h(m, b):
        if m == "alipay.trade.precreate":
            return {"code": "10000", "qr_code": "https://qr.alipay.com/abc"}
        return {"code": "10000", "trade_no": "T1", "fund_change": "Y"}
    gw, seen = alipay_gw(h)
    assert gw.precreate("P1", 500, "x", "https://njawyfzx.cn/api/pay/notify/alipay") == "https://qr.alipay.com/abc"
    assert seen[0]["notify_url"].endswith("/api/pay/notify/alipay")
    assert gw.refund("P1", "R1", 200, 500, "退货").status == "success"
    assert json.loads(seen[1]["biz_content"])["refund_amount"] == "2.00"


def test_alipay_wap_url_signed():
    gw, _ = alipay_gw(lambda m, b: {})
    url = gw.wap("P1", 100, "扫码点单", "https://n/notify", "https://n/back")
    params = dict(parse_qsl(url.split("?", 1)[1]))
    sign = params.pop("sign")
    assert params["method"] == "alipay.trade.wap.pay"
    assert ali.rsa2_verify(ali.load_public_key(MERCHANT_PUB), ali.sign_content(params), sign)


def test_alipay_notify():
    gw, _ = alipay_gw(lambda m, b: {})
    params = {"app_id": "2021000000000001", "out_trade_no": "P1", "trade_no": "T9", "trade_status": "TRADE_SUCCESS",
              "total_amount": "3.50", "buyer_id": "2088", "notify_time": "2026-11-26 18:00:00"}
    params["sign"] = ali.rsa2_sign(PLATFORM, ali.sign_content(params))
    params["sign_type"] = "RSA2"
    body = str(httpx.QueryParams(params)).encode()
    r = gw.parse_notify({}, body)
    assert (r.status, r.out_no, r.amount) == ("paid", "P1", 350)
    params["total_amount"] = "0.01"
    with pytest.raises(pay.PayError):
        gw.parse_notify({}, str(httpx.QueryParams(params)).encode())


# ---------------- 微信支付 ----------------

APIV3 = "0123456789abcdef0123456789abcdef"
V2KEY = "v2key0123456789abcdef0123456789a"


def wx_signed(status, data, headers=None):
    body = json.dumps(data)
    ts, nonce = str(int(time.time())), "n1"
    return httpx.Response(status, text=body, headers={
        "Wechatpay-Timestamp": ts, "Wechatpay-Nonce": nonce, "Wechatpay-Serial": "PUB_KEY_ID_1",
        "Wechatpay-Signature": wx.rsa_sign(PLATFORM, wx.v3_message(ts, nonce, body)), **(headers or {})})


def wechat_gw(handler):
    seen = []

    def app(req: httpx.Request):
        seen.append(req)
        if req.url.path.startswith("/v3/"):
            auth = req.headers["Authorization"]
            assert auth.startswith("WECHATPAY2-SHA256-RSA2048 ")
            f = dict(x.split("=", 1) for x in auth.split(" ", 1)[1].split(","))
            f = {k: v.strip('"') for k, v in f.items()}
            path = req.url.raw_path.decode()
            msg = wx.v3_message(req.method, path, f["timestamp"], f["nonce_str"], req.content.decode())
            assert wx.rsa_verify(serialization.load_pem_public_key(MERCHANT_PUB.encode()), msg, f["signature"])
            assert f["mchid"] == "1900000001" and f["serial_no"] == "SERIAL1"
        return handler(req)
    gw = wx.WechatGateway("1900000001", "wx1234", "SERIAL1", MERCHANT_PRIV, APIV3, "PUB_KEY_ID_1", PLATFORM_PUB,
                          api_v2_key=V2KEY, transport=httpx.MockTransport(app))
    return gw, seen


def test_wechat_native_and_query():
    def h(req):
        if req.url.path.endswith("/native"):
            assert json.loads(req.content)["amount"] == {"total": 990, "currency": "CNY"}
            return wx_signed(200, {"code_url": "weixin://wxpay/bizpayurl?pr=abc"})
        return wx_signed(200, {"trade_state": "SUCCESS", "out_trade_no": "P1", "transaction_id": "4200",
                               "amount": {"total": 990}, "payer": {"openid": "o1"}})
    gw, _ = wechat_gw(h)
    assert gw.precreate("P1", 990, "门店收款", "https://n/api/pay/notify/wechat").startswith("weixin://")
    r = gw.query("P1")
    assert (r.status, r.trade_no, r.amount, r.payer) == ("paid", "4200", 990, "o1")


def test_wechat_bad_response_signature():
    gw, _ = wechat_gw(lambda req: wx_signed(200, {"code_url": "x"}, {"Wechatpay-Signature": base64.b64encode(b"x").decode()}))
    with pytest.raises(pay.PayError):
        gw.precreate("P1", 1, "x", "https://n")


def test_wechat_query_not_exist_is_paying():
    gw, _ = wechat_gw(lambda req: httpx.Response(404, json={"code": "ORDER_NOT_EXIST", "message": "订单不存在"}))
    assert gw.query("P1").status == "paying"


def test_wechat_jsapi_pay_sign():
    gw, _ = wechat_gw(lambda req: wx_signed(200, {"prepay_id": "wx26"}))
    p = gw.jsapi("P1", 100, "扫码点单", "o1", "https://n")
    assert p["package"] == "prepay_id=wx26" and p["appId"] == "wx1234"
    msg = wx.v3_message(p["appId"], p["timeStamp"], p["nonceStr"], p["package"])
    assert wx.rsa_verify(serialization.load_pem_public_key(MERCHANT_PUB.encode()), msg, p["paySign"])


def test_wechat_refund():
    gw, seen = wechat_gw(lambda req: wx_signed(200, {"status": "PROCESSING", "refund_id": "5030"}))
    r = gw.refund("P1", "R1", 300, 990, "退货")
    assert (r.status, r.refund_no) == ("processing", "5030")
    assert json.loads(seen[0].content)["amount"] == {"refund": 300, "total": 990, "currency": "CNY"}


def wx_notify(data, event="TRANSACTION.SUCCESS"):
    nonce = "abcdefghijkl"
    ct = AESGCM(APIV3.encode()).encrypt(nonce.encode(), json.dumps(data).encode(), b"transaction")
    body = json.dumps({"event_type": event, "resource": {"algorithm": "AEAD_AES_256_GCM", "nonce": nonce,
                                                         "associated_data": "transaction",
                                                         "ciphertext": base64.b64encode(ct).decode()}})
    ts = str(int(time.time()))
    headers = {"Wechatpay-Timestamp": ts, "Wechatpay-Nonce": "n2", "Wechatpay-Serial": "PUB_KEY_ID_1",
               "Wechatpay-Signature": wx.rsa_sign(PLATFORM, wx.v3_message(ts, "n2", body))}
    return headers, body.encode()


def test_wechat_notify_decrypt_and_verify():
    gw, _ = wechat_gw(lambda req: None)
    h, b = wx_notify({"mchid": "1900000001", "out_trade_no": "P1", "transaction_id": "42", "trade_state": "SUCCESS",
                      "amount": {"total": 100}, "payer": {"openid": "o1"}})
    r = gw.parse_notify(h, b)
    assert (r.status, r.out_no, r.amount) == ("paid", "P1", 100)
    h["Wechatpay-Signature"] = wx.rsa_sign(MERCHANT, b"forged")
    with pytest.raises(pay.PayError):
        gw.parse_notify(h, b)
    h, b = wx_notify({"mchid": "1900000002", "out_trade_no": "P1", "trade_state": "SUCCESS"})
    with pytest.raises(pay.PayError):
        gw.parse_notify(h, b)


def test_wechat_notify_expired():
    gw, _ = wechat_gw(lambda req: None)
    h, b = wx_notify({"mchid": "1900000001", "out_trade_no": "P1", "trade_state": "SUCCESS"})
    ts = str(int(time.time()) - 600)
    h["Wechatpay-Timestamp"] = ts
    h["Wechatpay-Signature"] = wx.rsa_sign(PLATFORM, wx.v3_message(ts, "n2", b.decode()))
    with pytest.raises(pay.PayError):
        gw.parse_notify(h, b)


def v2_reply(**d):
    d = {"return_code": "SUCCESS", "nonce_str": "x", **d}
    d["sign"] = wx.v2_sign(d, V2KEY)
    return httpx.Response(200, text=wx.to_xml(d))


@pytest.mark.parametrize("reply,status", [
    (dict(result_code="SUCCESS", transaction_id="42", total_fee="100", openid="o1"), "paid"),
    (dict(result_code="FAIL", err_code="USERPAYING", err_code_des="需要用户输入支付密码"), "paying"),
    (dict(result_code="FAIL", err_code="SYSTEMERROR"), "paying"),
    (dict(result_code="FAIL", err_code="NOTENOUGH", err_code_des="余额不足"), "failed"),
])
def test_wechat_micropay(reply, status):
    def h(req):
        sent = wx.from_xml(req.content.decode())
        assert sent["sign"] == wx.v2_sign(sent, V2KEY) and sent["total_fee"] == "100"
        return v2_reply(**reply)
    gw, _ = wechat_gw(h)
    assert gw.micropay("P1", 100, "134567890123456789", "门店收款").status == status


def test_wechat_micropay_forged_reply():
    gw, _ = wechat_gw(lambda req: httpx.Response(200, text=wx.to_xml(
        {"return_code": "SUCCESS", "result_code": "SUCCESS", "sign": "FORGED"})))
    with pytest.raises(pay.PayError):
        gw.micropay("P1", 100, "134567890123456789", "x")


# ---------------- 交易记账（模拟通道） ----------------

@pytest.fixture
def mock_gws():
    gws = {p: MockGateway(p) for p in ("wechat", "alipay")}
    for p, g in gws.items():
        pay.set_gateway(p, g)
    return gws


def test_service_micropay_paid_once(client, mock_gws):
    paid = []
    service.PAID_HOOKS.append(lambda db, t: paid.append(t.out_no))
    with dbmod.SessionLocal() as db:
        t = service.micropay(db, None, 1000, "134567890123456780", "门店收款", None)
        assert t.status == "paid" and t.provider == "wechat" and t.trade_no
        # 重复的结果（例如再来一次通知）不再触发
        service.apply_result(db, t, pay.TradeResult("paid", out_no=t.out_no, amount=1000))
        assert paid == [t.out_no]


def test_service_micropay_userpaying_then_refresh(client, mock_gws):
    with dbmod.SessionLocal() as db:
        t = service.micropay(db, None, 500, "286543210987654327", "x", None)
        assert t.status == "pending" and t.provider == "alipay"
        service.refresh(db, t)
        assert t.status == "paid"


def test_service_micropay_failed_and_close(client, mock_gws):
    with dbmod.SessionLocal() as db:
        t = service.micropay(db, None, 500, "134567890123456788", "x", None)
        assert (t.status, t.message) == ("failed", "余额不足")
        t2 = service.micropay(db, None, 500, "134567890123456789", "x", None)
        assert t2.status == "pending"
        service.close(db, t2)
        assert t2.status == "closed"


def test_service_amount_mismatch_not_paid(client, mock_gws):
    with dbmod.SessionLocal() as db:
        t = service.micropay(db, None, 500, "134567890123456789", "x", None)
        service.apply_result(db, t, pay.TradeResult("paid", out_no=t.out_no, amount=1))
        assert t.status == "failed" and "金额不符" in t.message


def test_service_unknown_code_and_disabled_channel(client):
    pay.set_gateway("wechat", None)
    with dbmod.SessionLocal() as db:
        with pytest.raises(Exception) as e:
            service.micropay(db, None, 500, "999", "x", None)
        assert "无法识别" in str(e.value.detail)
        with pytest.raises(Exception) as e:
            service.micropay(db, None, 500, "134567890123456789", "x", None)
        assert "尚未开通" in str(e.value.detail)


def test_service_refund_limits(client, mock_gws):
    with dbmod.SessionLocal() as db:
        t = service.micropay(db, None, 1000, "134567890123456780", "x", None)
        r1 = service.refund(db, t, 400, "退货", None)
        assert r1.status == "success" and t.refunded == 400
        assert service.refundable(db, t) == 600
        with pytest.raises(Exception) as e:
            service.refund(db, t, 700, "退货", None)
        assert "6.00" in str(e.value.detail)
        service.refund(db, t, 600, "退货", None)
        assert service.refundable(db, t) == 0


def test_notify_endpoint(client, mock_gws):
    paid = []
    service.PAID_HOOKS.append(lambda db, t: paid.append(t.id))
    with dbmod.SessionLocal() as db:
        t, url = service.precreate(db, "alipay", None, 800, "x", "https://n", None)
        out_no = t.out_no
        db.commit()
    body = json.dumps({"out_no": out_no})
    r = client.post("/api/pay/notify/alipay", content=body, headers={"x-mock-sign": "bad"})
    assert r.status_code == 400
    for _ in range(2):  # 支付平台会重发
        r = client.post("/api/pay/notify/alipay", content=body, headers={"x-mock-sign": "ok"})
        assert r.status_code == 200 and r.text == "success"
    with dbmod.SessionLocal() as db:
        t = db.query(PayTxn).filter_by(out_no=out_no).one()
        assert t.status == "paid"
    assert len(paid) == 1
    assert client.post("/api/pay/notify/unionpay", content=b"").status_code == 404


def test_channels(client, mock_gws):
    admin = login(client, "admin", "admin123")
    d = admin.get("/api/pay/channels")
    assert d["wechat"]["mode"] == "mock" and "micropay" in d["alipay"]["scenes"]
    pay.set_gateway("alipay", None)
    assert admin.get("/api/pay/channels")["alipay"] == {"name": "支付宝", "mode": "off", "scenes": []}
    assert client.get("/api/pay/channels").status_code == 401


def test_mock_not_in_production(monkeypatch):
    monkeypatch.setenv("PAY_MOCK", "1")
    monkeypatch.setenv("SHOUYIN_ENV", "production")
    assert not pay.mock_enabled()
    monkeypatch.setenv("SHOUYIN_ENV", "test")
    assert pay.mock_enabled()
