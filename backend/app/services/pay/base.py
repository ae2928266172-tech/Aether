"""收款通道的公共接口。

每个通道（微信支付、支付宝、模拟）实现同一组方法，上层收银 / 扫码点单只认这些方法，
以后换服务商只要再写一个通道。金额一律是分。
"""
from dataclasses import dataclass, field

# 交易状态：paid 已付 / paying 顾客还在输密码或还没扫码 / failed 失败（可换方式重试）/ closed 已关闭
PAID, PAYING, FAILED, CLOSED = "paid", "paying", "failed", "closed"


class PayError(Exception):
    """调用支付平台失败（网络、签名、参数）。message 直接给店员看，写得让人能看懂。"""


@dataclass
class TradeResult:
    status: str
    out_no: str = ""
    trade_no: str = ""
    amount: int | None = None  # 支付平台回报的金额，用来核对
    payer: str = ""
    message: str = ""
    raw: dict = field(default_factory=dict)


@dataclass
class RefundResult:
    status: str  # success / processing / failed
    refund_no: str = ""
    message: str = ""


class Gateway:
    provider = ""
    # 这个通道支持的场景：micropay 扫顾客付款码 / native 出收款码 / jsapi 微信内网页 / wap 手机网站
    scenes: tuple[str, ...] = ()

    def micropay(self, out_no: str, amount: int, auth_code: str, subject: str, client_ip: str = "") -> TradeResult:
        raise NotImplementedError

    def precreate(self, out_no: str, amount: int, subject: str, notify_url: str) -> str:
        """出收款码，返回二维码内容。"""
        raise NotImplementedError

    def jsapi(self, out_no: str, amount: int, subject: str, openid: str, notify_url: str) -> dict:
        """微信内网页付款，返回给前端调起支付的参数。"""
        raise NotImplementedError

    def wap(self, out_no: str, amount: int, subject: str, notify_url: str, return_url: str) -> str:
        """手机网站付款，返回跳转地址。"""
        raise NotImplementedError

    def query(self, out_no: str) -> TradeResult:
        raise NotImplementedError

    def close(self, out_no: str) -> None:
        """关闭 / 撤销没付成的交易，之后顾客再付也付不进来。"""
        raise NotImplementedError

    def refund(self, out_no: str, out_refund_no: str, amount: int, total: int, reason: str) -> RefundResult:
        raise NotImplementedError

    def parse_notify(self, headers: dict, body: bytes) -> TradeResult:
        """验签并解析付款结果通知。验签不过抛 PayError。"""
        raise NotImplementedError

    # 回调要给支付平台的应答
    notify_ok: tuple[str, str] = ("success", "text/plain")


def detect_provider(auth_code: str) -> str | None:
    """按付款码前缀判断是哪家：微信 10–15 开头 18 位；支付宝 25–30 开头 16–24 位。"""
    code = (auth_code or "").strip()
    if not code.isdigit():
        return None
    if len(code) == 18 and 10 <= int(code[:2]) <= 15:
        return "wechat"
    if 16 <= len(code) <= 24 and 25 <= int(code[:2]) <= 30:
        return "alipay"
    return None
