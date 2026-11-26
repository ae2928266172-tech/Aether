"""微信支付直连商户。

- 出收款码（Native）、微信内网页（JSAPI）、查单、关单、退款、付款通知：APIv3，商户私钥 RSA 签名，
  用“微信支付公钥”验签（2024 年后新开商户号默认就是公钥模式），通知内容用 APIv3 密钥 AES-256-GCM 解密。
  文档：https://pay.weixin.qq.com/doc/v3/merchant/4012062524
- 扫顾客付款码（付款码支付）和撤销：APIv2（XML，HMAC-SHA256，APIv2 密钥；撤销要 API 证书）。
  文档：https://pay.weixin.qq.com/wiki/doc/api/micropay.php?chapter=9_10
微信支付没有可用的 APIv3 沙箱，联调靠模拟通道 + 商户号下来后 0.01 元实付。
"""
import base64
import hashlib
import hmac
import json
import secrets
import time
import xml.etree.ElementTree as ET

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .base import CLOSED, FAILED, PAID, PAYING, Gateway, PayError, RefundResult, TradeResult

API = "https://api.mch.weixin.qq.com"


# ---------- APIv3 ----------

def v3_message(*parts: str) -> bytes:
    return "".join(p + "\n" for p in parts).encode()


def rsa_sign(private_key, message: bytes) -> str:
    return base64.b64encode(private_key.sign(message, padding.PKCS1v15(), hashes.SHA256())).decode()


def rsa_verify(public_key, message: bytes, sign: str) -> bool:
    try:
        public_key.verify(base64.b64decode(sign), message, padding.PKCS1v15(), hashes.SHA256())
        return True
    except Exception:
        return False


def decrypt_resource(api_v3_key: str, resource: dict) -> dict:
    try:
        plain = AESGCM(api_v3_key.encode()).decrypt(resource["nonce"].encode(), base64.b64decode(resource["ciphertext"]),
                                                   (resource.get("associated_data") or "").encode())
    except Exception as e:
        raise PayError("微信支付通知解密失败") from e
    return json.loads(plain)


# ---------- APIv2 ----------

def v2_sign(params: dict, key: str) -> str:
    content = "&".join(f"{k}={params[k]}" for k in sorted(params) if k != "sign" and params[k] not in (None, ""))
    return hmac.new(key.encode(), (content + "&key=" + key).encode(), hashlib.sha256).hexdigest().upper()


def to_xml(params: dict) -> str:
    return "<xml>" + "".join(f"<{k}><![CDATA[{v}]]></{k}>" for k, v in params.items()) + "</xml>"


def from_xml(text: str) -> dict:
    try:
        root = ET.fromstring(text)
    except ET.ParseError as e:
        raise PayError("微信支付返回内容无法解析") from e
    return {c.tag: (c.text or "") for c in root}


TRADE_STATE = {"SUCCESS": PAID, "REFUND": PAID, "NOTPAY": PAYING, "USERPAYING": PAYING, "ACCEPT": PAYING,
               "CLOSED": CLOSED, "REVOKED": CLOSED, "PAYERROR": FAILED}


class WechatGateway(Gateway):
    provider = "wechat"
    scenes = ("micropay", "native", "jsapi")
    notify_ok = ("", "text/plain")  # APIv3 通知只要 200 / 204，不需要应答内容

    def __init__(self, mchid: str, appid: str, serial_no: str, private_key_pem: str, api_v3_key: str,
                 pay_public_key_id: str, pay_public_key_pem: str, api_v2_key: str = "",
                 cert: tuple[str, str] | None = None, transport: httpx.BaseTransport | None = None):
        self.mchid, self.appid, self.serial_no = mchid, appid, serial_no
        self.key = serialization.load_pem_private_key(private_key_pem.encode(), password=None)
        self.api_v3_key, self.api_v2_key = api_v3_key, api_v2_key
        self.pub_id = pay_public_key_id
        self.pub = serialization.load_pem_public_key(pay_public_key_pem.encode())
        self.client = httpx.Client(base_url=API, timeout=15, transport=transport)
        # 撤销接口要双向证书；没配证书就不能撤销，只能等顾客付款超时
        self.cert_client = httpx.Client(base_url=API, timeout=15, transport=transport, cert=cert) if cert or transport else None

    # ----- APIv3 -----
    def _auth(self, method: str, path: str, body: str) -> str:
        ts, nonce = str(int(time.time())), secrets.token_hex(16)
        sig = rsa_sign(self.key, v3_message(method, path, ts, nonce, body))
        return (f'WECHATPAY2-SHA256-RSA2048 mchid="{self.mchid}",nonce_str="{nonce}",signature="{sig}",'
                f'timestamp="{ts}",serial_no="{self.serial_no}"')

    def _verify(self, headers, body: str):
        h = {k.lower(): v for k, v in headers.items()}
        if h.get("wechatpay-serial") != self.pub_id:
            raise PayError("微信支付签名的公钥 ID 不符")
        ts = h.get("wechatpay-timestamp", "0")
        if abs(time.time() - int(ts)) > 300:
            raise PayError("微信支付签名已过期")
        if not rsa_verify(self.pub, v3_message(ts, h.get("wechatpay-nonce", ""), body), h.get("wechatpay-signature", "")):
            raise PayError("微信支付验签失败")

    def _v3(self, method: str, path: str, data: dict | None = None) -> tuple[int, dict]:
        body = json.dumps(data, ensure_ascii=False, separators=(",", ":")) if data is not None else ""
        try:
            r = self.client.request(method, path, content=body.encode() if body else None, headers={
                "Authorization": self._auth(method, path, body), "Accept": "application/json",
                "Content-Type": "application/json", "Wechatpay-Serial": self.pub_id})
        except httpx.HTTPError as e:
            raise PayError(f"连不上微信支付：{e.__class__.__name__}") from e
        if r.status_code < 300 and r.text:
            self._verify(r.headers, r.text)
        try:
            return r.status_code, (r.json() if r.text else {})
        except ValueError as e:
            raise PayError("微信支付返回内容无法解析") from e

    @staticmethod
    def _err(d: dict) -> str:
        return d.get("message") or d.get("code") or "微信支付返回错误"

    def precreate(self, out_no, amount, subject, notify_url):
        code, d = self._v3("POST", "/v3/pay/transactions/native", {
            "appid": self.appid, "mchid": self.mchid, "description": subject[:127], "out_trade_no": out_no,
            "notify_url": notify_url, "amount": {"total": amount, "currency": "CNY"},
            "time_expire": time.strftime("%Y-%m-%dT%H:%M:%S+08:00", time.localtime(time.time() + 900))})
        if code >= 300 or not d.get("code_url"):
            raise PayError(self._err(d))
        return d["code_url"]

    def jsapi(self, out_no, amount, subject, openid, notify_url):
        code, d = self._v3("POST", "/v3/pay/transactions/jsapi", {
            "appid": self.appid, "mchid": self.mchid, "description": subject[:127], "out_trade_no": out_no,
            "notify_url": notify_url, "amount": {"total": amount, "currency": "CNY"}, "payer": {"openid": openid},
            "time_expire": time.strftime("%Y-%m-%dT%H:%M:%S+08:00", time.localtime(time.time() + 900))})
        if code >= 300 or not d.get("prepay_id"):
            raise PayError(self._err(d))
        ts, nonce, pkg = str(int(time.time())), secrets.token_hex(16), "prepay_id=" + d["prepay_id"]
        return {"appId": self.appid, "timeStamp": ts, "nonceStr": nonce, "package": pkg, "signType": "RSA",
                "paySign": rsa_sign(self.key, v3_message(self.appid, ts, nonce, pkg))}

    def _trade(self, d: dict, out_no: str) -> TradeResult:
        return TradeResult(status=TRADE_STATE.get(d.get("trade_state", ""), PAYING), out_no=d.get("out_trade_no", out_no),
                           trade_no=d.get("transaction_id", ""), amount=(d.get("amount") or {}).get("total"),
                           payer=(d.get("payer") or {}).get("openid", ""), message=d.get("trade_state_desc", ""), raw=d)

    def query(self, out_no):
        code, d = self._v3("GET", f"/v3/pay/transactions/out-trade-no/{out_no}?mchid={self.mchid}")
        if code == 404 or d.get("code") == "ORDER_NOT_EXIST":
            return TradeResult(PAYING, out_no=out_no, raw=d)
        if code >= 300:
            raise PayError(self._err(d))
        return self._trade(d, out_no)

    def close(self, out_no):
        # 付款码交易走 v2 撤销；Native / JSAPI 走 v3 关单。分不清时先撤销再关单都试
        if self.cert_client is not None and self.api_v2_key:
            p = {"appid": self.appid, "mch_id": self.mchid, "out_trade_no": out_no, "nonce_str": secrets.token_hex(16),
                 "sign_type": "HMAC-SHA256"}
            p["sign"] = v2_sign(p, self.api_v2_key)
            try:
                d = from_xml(self.cert_client.post("/secapi/pay/reverse", content=to_xml(p).encode()).text)
            except httpx.HTTPError as e:
                raise PayError(f"连不上微信支付：{e.__class__.__name__}") from e
            if d.get("result_code") == "SUCCESS":
                return
        code, d = self._v3("POST", f"/v3/pay/transactions/out-trade-no/{out_no}/close", {"mchid": self.mchid})
        if code >= 300 and d.get("code") not in ("ORDER_CLOSED", "ORDER_NOT_EXIST"):
            raise PayError(self._err(d))

    def refund(self, out_no, out_refund_no, amount, total, reason):
        code, d = self._v3("POST", "/v3/refund/domestic/refunds", {
            "out_trade_no": out_no, "out_refund_no": out_refund_no, "reason": reason[:80],
            "amount": {"refund": amount, "total": total, "currency": "CNY"}})
        if code >= 300:
            return RefundResult("failed", message=self._err(d))
        status = {"SUCCESS": "success", "PROCESSING": "processing"}.get(d.get("status", ""), "failed")
        return RefundResult(status, refund_no=d.get("refund_id", ""),
                            message="" if status != "failed" else "退款异常，请到微信支付商户平台处理")

    def parse_notify(self, headers, body):
        text = body.decode("utf-8")
        self._verify(headers, text)
        d = json.loads(text)
        if d.get("event_type") != "TRANSACTION.SUCCESS":
            raise PayError("不是付款成功通知")
        data = decrypt_resource(self.api_v3_key, d.get("resource") or {})
        if data.get("mchid") != self.mchid:
            raise PayError("微信支付通知商户号不符")
        return self._trade(data, data.get("out_trade_no", ""))

    # ----- APIv2 付款码 -----
    def micropay(self, out_no, amount, auth_code, subject, client_ip=""):
        if not self.api_v2_key:
            raise PayError("微信付款码支付需要配置 APIv2 密钥")
        p = {"appid": self.appid, "mch_id": self.mchid, "nonce_str": secrets.token_hex(16), "sign_type": "HMAC-SHA256",
             "body": subject[:40], "out_trade_no": out_no, "total_fee": str(amount), "fee_type": "CNY",
             "spbill_create_ip": client_ip or "127.0.0.1", "auth_code": auth_code}
        p["sign"] = v2_sign(p, self.api_v2_key)
        try:
            text = self.client.post("/pay/micropay", content=to_xml(p).encode(),
                                    headers={"Content-Type": "text/xml"}).text
        except httpx.HTTPError:
            # 网络断了不知道付没付，按“付款中”处理，由上层查单
            return TradeResult(PAYING, out_no=out_no, message="网络异常，正在查询")
        d = from_xml(text)
        if d.get("return_code") != "SUCCESS":
            return TradeResult(FAILED, out_no=out_no, message=d.get("return_msg") or "微信支付请求失败", raw=d)
        if d.get("sign") and v2_sign(d, self.api_v2_key) != d["sign"]:
            raise PayError("微信支付响应验签失败")
        if d.get("result_code") == "SUCCESS":
            return TradeResult(PAID, out_no=out_no, trade_no=d.get("transaction_id", ""),
                               amount=int(d["total_fee"]) if d.get("total_fee") else None, payer=d.get("openid", ""), raw=d)
        if d.get("err_code") in ("USERPAYING", "SYSTEMERROR", "BANKERROR"):
            return TradeResult(PAYING, out_no=out_no, message=d.get("err_code_des", ""), raw=d)
        return TradeResult(FAILED, out_no=out_no, message=d.get("err_code_des") or d.get("err_code") or "付款失败", raw=d)
