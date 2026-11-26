"""在线收款通道的配置和取用。

密钥只放服务器环境变量（/etc/shouyin/shouyin.env）和密钥文件，不进数据库、不进后台页面。

支付宝：ALIPAY_APP_ID、ALIPAY_PRIVATE_KEY_FILE（应用私钥）、ALIPAY_PUBLIC_KEY_FILE（支付宝公钥）、
        ALIPAY_SANDBOX=1 时连沙箱
微信支付：WXPAY_MCHID、WXPAY_APPID（服务号 AppID）、WXPAY_SERIAL_NO（商户 API 证书序列号）、
        WXPAY_PRIVATE_KEY_FILE（apiclient_key.pem）、WXPAY_APIV3_KEY、
        WXPAY_PUBLIC_KEY_ID + WXPAY_PUBLIC_KEY_FILE（微信支付公钥）、
        WXPAY_APIV2_KEY（付款码支付要用）、WXPAY_CERT_FILE（apiclient_cert.pem，撤销要用）
PAY_MOCK=1：两家都用模拟通道（正式环境不生效）。
"""
import logging
import os

from ...startup_check import is_production
from .base import CLOSED, FAILED, PAID, PAYING, Gateway, PayError, RefundResult, TradeResult, detect_provider

PROVIDERS = {"wechat": "微信支付", "alipay": "支付宝"}
log = logging.getLogger("shouyin")
_cache: dict[str, Gateway | None] = {}


def _read(path_env: str) -> str | None:
    path = os.environ.get(path_env)
    if not path:
        return None
    with open(path, encoding="utf-8") as f:
        return f.read()


def mock_enabled() -> bool:
    return os.environ.get("PAY_MOCK") == "1" and not is_production()


def _build(provider: str) -> Gateway | None:
    if mock_enabled():
        from .mock import MockGateway
        return MockGateway(provider)
    e = os.environ.get
    try:
        if provider == "alipay" and e("ALIPAY_APP_ID"):
            from .alipay import AlipayGateway
            return AlipayGateway(e("ALIPAY_APP_ID"), _read("ALIPAY_PRIVATE_KEY_FILE") or "",
                                 _read("ALIPAY_PUBLIC_KEY_FILE") or "", sandbox=e("ALIPAY_SANDBOX") == "1")
        if provider == "wechat" and e("WXPAY_MCHID"):
            from .wechat import WechatGateway
            cert = (e("WXPAY_CERT_FILE"), e("WXPAY_PRIVATE_KEY_FILE")) if e("WXPAY_CERT_FILE") else None
            return WechatGateway(e("WXPAY_MCHID"), e("WXPAY_APPID", ""), e("WXPAY_SERIAL_NO", ""),
                                 _read("WXPAY_PRIVATE_KEY_FILE") or "", e("WXPAY_APIV3_KEY", ""),
                                 e("WXPAY_PUBLIC_KEY_ID", ""), _read("WXPAY_PUBLIC_KEY_FILE") or "",
                                 api_v2_key=e("WXPAY_APIV2_KEY", ""), cert=cert)
    except Exception:  # 配错了不影响整个系统启动，只是这个通道不可用
        log.exception("%s 收款配置有误，已停用该通道", PROVIDERS[provider])
    return None


def gateway(provider: str) -> Gateway | None:
    """取收款通道；没配置返回 None。"""
    if provider not in PROVIDERS:
        return None
    if provider not in _cache:
        _cache[provider] = _build(provider)
    return _cache[provider]


def set_gateway(provider: str, gw: Gateway | None):
    """测试用：换成指定通道。"""
    _cache[provider] = gw


def reset():
    _cache.clear()


def mode(provider: str) -> str:
    """off 未配置 / mock 模拟 / sandbox 沙箱 / live 正式。"""
    gw = gateway(provider)
    if gw is None:
        return "off"
    if gw.__class__.__name__ == "MockGateway":
        return "mock"
    if provider == "alipay" and os.environ.get("ALIPAY_SANDBOX") == "1":
        return "sandbox"
    return "live"


__all__ = ["CLOSED", "FAILED", "PAID", "PAYING", "Gateway", "PayError", "RefundResult", "TradeResult",
           "detect_provider", "gateway", "set_gateway", "reset", "mode", "mock_enabled", "PROVIDERS"]
