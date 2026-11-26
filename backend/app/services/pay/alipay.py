"""支付宝开放平台（当面付 + 手机网站支付），RSA2 签名，公钥模式。

文档：https://opendocs.alipay.com/open/194/106039（当面付）、https://opendocs.alipay.com/open/203（手机网站支付）
沙箱网关 https://openapi-sandbox.dl.alipaydev.com/gateway.do，用开放平台控制台里沙箱应用的 AppID 和密钥即可联调。
"""
import base64
import json
from datetime import datetime
from urllib.parse import urlencode

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from .base import CLOSED, FAILED, PAID, PAYING, Gateway, PayError, RefundResult, TradeResult

PROD = "https://openapi.alipay.com/gateway.do"
SANDBOX = "https://openapi-sandbox.dl.alipaydev.com/gateway.do"


def load_private_key(pem: str):
    pem = pem.strip()
    if not pem.startswith("-----"):  # 支付宝密钥工具导出的是不带头尾的一行 PKCS#8
        pem = "-----BEGIN PRIVATE KEY-----\n" + pem + "\n-----END PRIVATE KEY-----"
    return serialization.load_pem_private_key(pem.encode(), password=None)


def load_public_key(pem: str):
    pem = pem.strip()
    if not pem.startswith("-----"):
        pem = "-----BEGIN PUBLIC KEY-----\n" + pem + "\n-----END PUBLIC KEY-----"
    return serialization.load_pem_public_key(pem.encode())


def sign_content(params: dict) -> str:
    """待签名串：去掉 sign 和空值，按键名排序，k=v 用 & 连起来。"""
    return "&".join(f"{k}={params[k]}" for k in sorted(params) if k != "sign" and params[k] not in (None, ""))


def rsa2_sign(private_key, content: str) -> str:
    return base64.b64encode(private_key.sign(content.encode(), padding.PKCS1v15(), hashes.SHA256())).decode()


def rsa2_verify(public_key, content: str, sign: str) -> bool:
    try:
        public_key.verify(base64.b64decode(sign), content.encode(), padding.PKCS1v15(), hashes.SHA256())
        return True
    except Exception:
        return False


def _raw_node(text: str, node: str) -> str | None:
    """取出响应里 xxx_response 节点的原始 JSON 文本（支付宝对这段原文签名，不能先解析再序列化）。"""
    key = f'"{node}"'
    i = text.find(key)
    if i < 0:
        return None
    i = text.index(":", i + len(key)) + 1
    while text[i] in " \t\r\n":
        i += 1
    if text[i] != "{":
        return None
    depth, in_str, esc = 0, False, False
    for j in range(i, len(text)):
        ch = text[j]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[i:j + 1]
    return None


def yuan(fen: int) -> str:
    return f"{fen / 100:.2f}"


def fen(v) -> int | None:
    if v in (None, ""):
        return None
    return int(round(float(v) * 100))


class AlipayGateway(Gateway):
    provider = "alipay"
    scenes = ("micropay", "native", "wap")
    notify_ok = ("success", "text/plain")

    def __init__(self, app_id: str, private_key_pem: str, alipay_public_key_pem: str, sandbox: bool = False,
                 transport: httpx.BaseTransport | None = None):
        self.app_id = app_id
        self.key = load_private_key(private_key_pem)
        self.alipay_key = load_public_key(alipay_public_key_pem)
        self.gateway = SANDBOX if sandbox else PROD
        self.client = httpx.Client(timeout=15, transport=transport)

    def _params(self, method: str, biz: dict, **extra) -> dict:
        p = {"app_id": self.app_id, "method": method, "format": "JSON", "charset": "utf-8", "sign_type": "RSA2",
             "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "version": "1.0",
             "biz_content": json.dumps(biz, ensure_ascii=False, separators=(",", ":")), **extra}
        p["sign"] = rsa2_sign(self.key, sign_content(p))
        return p

    def _call(self, method: str, biz: dict, **extra) -> dict:
        try:
            r = self.client.post(self.gateway, data=self._params(method, biz, **extra))
        except httpx.HTTPError as e:
            raise PayError(f"连不上支付宝：{e.__class__.__name__}") from e
        text = r.text
        node = method.replace(".", "_") + "_response"
        raw = _raw_node(text, node)
        try:
            data = json.loads(text)
        except ValueError as e:
            raise PayError("支付宝返回内容无法解析") from e
        resp = data.get(node) or data.get("error_response") or {}
        sign = data.get("sign")
        # 成功的响应必带签名；验签不过一律当作失败，防止被冒充
        if raw is not None and sign:
            if not rsa2_verify(self.alipay_key, raw, sign):
                raise PayError("支付宝响应验签失败")
        elif resp.get("code") == "10000":
            raise PayError("支付宝响应缺少签名")
        return resp

    @staticmethod
    def _err(resp: dict) -> str:
        return resp.get("sub_msg") or resp.get("msg") or "支付宝返回错误"

    def _trade(self, resp: dict, out_no: str) -> TradeResult:
        status = {"TRADE_SUCCESS": PAID, "TRADE_FINISHED": PAID, "WAIT_BUYER_PAY": PAYING,
                  "TRADE_CLOSED": CLOSED}.get(resp.get("trade_status", ""), PAYING)
        return TradeResult(status=status, out_no=resp.get("out_trade_no", out_no), trade_no=resp.get("trade_no", ""),
                           amount=fen(resp.get("total_amount")), payer=resp.get("buyer_user_id", "") or resp.get("buyer_open_id", ""),
                           raw=resp)

    def micropay(self, out_no, amount, auth_code, subject, client_ip=""):
        resp = self._call("alipay.trade.pay", {"out_trade_no": out_no, "scene": "bar_code", "auth_code": auth_code,
                                               "subject": subject, "total_amount": yuan(amount)})
        code = resp.get("code")
        if code == "10000":
            r = self._trade(resp, out_no)
            r.status = PAID
            return r
        if code == "10003":  # 等待用户付款（输密码）
            return TradeResult(PAYING, out_no=out_no, raw=resp)
        if code == "20000":  # 系统繁忙，结果未知，要查单
            return TradeResult(PAYING, out_no=out_no, message="结果未知，正在查询", raw=resp)
        return TradeResult(FAILED, out_no=out_no, message=self._err(resp), raw=resp)

    def precreate(self, out_no, amount, subject, notify_url):
        resp = self._call("alipay.trade.precreate", {"out_trade_no": out_no, "subject": subject,
                                                     "total_amount": yuan(amount), "timeout_express": "15m"},
                          notify_url=notify_url)
        if resp.get("code") != "10000" or not resp.get("qr_code"):
            raise PayError(self._err(resp))
        return resp["qr_code"]

    def wap(self, out_no, amount, subject, notify_url, return_url):
        p = self._params("alipay.trade.wap.pay", {"out_trade_no": out_no, "subject": subject,
                                                 "total_amount": yuan(amount), "product_code": "QUICK_WAP_WAY",
                                                 "timeout_express": "15m", "quit_url": return_url},
                         notify_url=notify_url, return_url=return_url)
        return self.gateway + "?" + urlencode(p)

    def query(self, out_no):
        resp = self._call("alipay.trade.query", {"out_trade_no": out_no})
        if resp.get("code") == "10000":
            return self._trade(resp, out_no)
        if resp.get("sub_code") == "ACQ.TRADE_NOT_EXIST":  # 顾客还没扫码时支付宝查不到这笔
            return TradeResult(PAYING, out_no=out_no, raw=resp)
        raise PayError(self._err(resp))

    def close(self, out_no):
        # 撤销：没付的关单，已付的会退款；收银这边只在确认没付成功时调用
        resp = self._call("alipay.trade.cancel", {"out_trade_no": out_no})
        if resp.get("code") != "10000" and resp.get("sub_code") != "ACQ.TRADE_NOT_EXIST":
            raise PayError(self._err(resp))

    def refund(self, out_no, out_refund_no, amount, total, reason):
        resp = self._call("alipay.trade.refund", {"out_trade_no": out_no, "refund_amount": yuan(amount),
                                                  "out_request_no": out_refund_no, "refund_reason": reason[:50]})
        if resp.get("code") == "10000":
            # fund_change=N 表示这个退款请求号之前已经退过（重发），钱也已经退了
            return RefundResult("success", refund_no=resp.get("trade_no", ""))
        if resp.get("code") == "20000":
            return RefundResult("processing", message="支付宝繁忙，稍后再查")
        return RefundResult("failed", message=self._err(resp))

    def parse_notify(self, headers, body):
        from urllib.parse import parse_qsl
        params = dict(parse_qsl(body.decode("utf-8"), keep_blank_values=True))
        sign = params.pop("sign", "")
        params.pop("sign_type", None)
        if not sign or not rsa2_verify(self.alipay_key, sign_content(params), sign):
            raise PayError("支付宝通知验签失败")
        if params.get("app_id") != self.app_id:
            raise PayError("支付宝通知 AppID 不符")
        return self._trade(params, params.get("out_trade_no", ""))
