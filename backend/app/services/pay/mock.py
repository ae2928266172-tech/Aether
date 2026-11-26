"""模拟通道：商户号下来前用来开发和测试，不连任何支付平台。

只在 PAY_MOCK=1 且不是正式环境时启用。付款码末位决定结果：
0–6 直接成功；7 进入“顾客输密码中”，再查一次变成功；8 失败（余额不足）；9 一直等，直到关单。
出收款码 / 网页付款的交易，调用 mock_pay(out_no) 模拟顾客付款。
"""
from .base import CLOSED, FAILED, PAID, PAYING, Gateway, PayError, RefundResult, TradeResult


class MockGateway(Gateway):
    scenes = ("micropay", "native", "jsapi", "wap")

    def __init__(self, provider: str):
        self.provider = provider
        self.trades: dict[str, dict] = {}

    def _result(self, out_no: str) -> TradeResult:
        t = self.trades.get(out_no)
        if not t:
            raise PayError("交易不存在")
        return TradeResult(status=t["status"], out_no=out_no, trade_no=t["trade_no"] if t["status"] == PAID else "",
                           amount=t["amount"], payer=t.get("payer", ""), message=t.get("message", ""))

    def _new(self, out_no: str, amount: int, status: str, **kw):
        if out_no in self.trades:
            raise PayError("商户单号重复")
        self.trades[out_no] = {"amount": amount, "status": status, "trade_no": "MOCK" + out_no, **kw}

    def micropay(self, out_no, amount, auth_code, subject, client_ip=""):
        last = auth_code[-1:]
        if last == "8":
            self._new(out_no, amount, FAILED, message="余额不足")
        elif last in ("7", "9"):
            self._new(out_no, amount, PAYING, slow=last == "9")
        else:
            self._new(out_no, amount, PAID, payer="mock_buyer")
        return self._result(out_no)

    def precreate(self, out_no, amount, subject, notify_url):
        self._new(out_no, amount, PAYING, slow=True)
        return f"mock://{self.provider}/{out_no}"

    def jsapi(self, out_no, amount, subject, openid, notify_url):
        self._new(out_no, amount, PAYING, slow=True, payer=openid)
        return {"mock": True, "out_no": out_no}

    def wap(self, out_no, amount, subject, notify_url, return_url):
        self._new(out_no, amount, PAYING, slow=True)
        return f"mock://{self.provider}/{out_no}?return={return_url}"

    def mock_pay(self, out_no: str):
        t = self.trades[out_no]
        if t["status"] == PAYING:
            t["status"] = PAID

    def query(self, out_no):
        t = self.trades.get(out_no)
        if t and t["status"] == PAYING and not t.get("slow"):
            t["status"] = PAID
        return self._result(out_no)

    def close(self, out_no):
        t = self.trades.get(out_no)
        if t and t["status"] == PAID:
            raise PayError("交易已付款，不能关闭")
        if t:
            t["status"] = CLOSED

    def refund(self, out_no, out_refund_no, amount, total, reason):
        t = self.trades.get(out_no)
        if not t or t["status"] != PAID:
            return RefundResult("failed", message="交易未付款")
        refs = t.setdefault("refunds", {})
        if out_refund_no in refs:
            return RefundResult("success", refund_no="R" + out_refund_no)
        if sum(refs.values()) + amount > t["amount"]:
            return RefundResult("failed", message="退款金额超过可退金额")
        refs[out_refund_no] = amount
        return RefundResult("success", refund_no="R" + out_refund_no)

    def parse_notify(self, headers, body):
        import json
        d = json.loads(body or b"{}")
        if headers.get("x-mock-sign") != "ok":
            raise PayError("验签失败")
        self.mock_pay(d["out_no"])
        return self._result(d["out_no"])
