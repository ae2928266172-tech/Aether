"""打印队列：门店选择“打印小助手”出票时，新订单、收银、补打都放进队列，由接小票机的电脑取走打印。"""
from sqlalchemy.orm import Session

from ..models import Exchange, Order, PrintJob, Store, User


def enqueue(db: Session, store: Store, order: Order | None, kind: str, user: User | None = None,
            exchange: Exchange | None = None) -> PrintJob | None:
    if store.print_mode != "agent":
        return None
    job = PrintJob(store_id=store.id, order_id=order.id if order else None, kind=kind,
                   exchange_id=exchange.id if exchange else None, created_by=user.id if user else None)
    db.add(job)
    db.flush()
    return job


def auto_enqueue(db: Session, order: Order, user: User | None = None):
    """下单 / 收银后自动出票（按门店设置）。"""
    store = order.store
    if store.print_mode != "agent":
        return
    if order.source == "online" and store.auto_print_online:
        enqueue(db, store, order, "new_order", user)
    elif order.source == "pos" and store.auto_print_pos:
        enqueue(db, store, order, "pos", user)
