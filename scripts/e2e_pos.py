"""
门店收银、顾客端可见、起订量、买赠、供应商对账：后端接口端到端测试

前置：先执行 scripts/e2e_hospital.py（会创建支付应用、病区等）。
用法：python3 scripts/e2e_pos.py
"""
import json, random, sys, time, urllib.parse, urllib.request
from datetime import date

BASE = 'http://127.0.0.1:48080'


def call(method, path, token=None, body=None, expect_ok=True):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header('Content-Type', 'application/json'); req.add_header('tenant-id', '1')
    if token: req.add_header('Authorization', 'Bearer ' + token)
    r = json.load(urllib.request.urlopen(req))
    if expect_ok and r.get('code') != 0:
        print('FAIL', method, path, body, r); sys.exit(1)
    return r


def ok(path, token=None, body=None, method=None):
    return call(method or ('POST' if body is not None else 'GET'), path, token, body)['data']


def check(name, actual, expected):
    print(('OK  ' if actual == expected else 'FAIL'), name, actual, '' if actual == expected else f'(expected {expected})')
    if actual != expected: sys.exit(1)


def admin_login(u):
    return ok('/admin-api/system/auth/login', body={'username': u, 'password': 'admin123'})['accessToken']


A = admin_login('admin'); S = admin_login('store')
# 供应商、分类、品牌、物料
sup = ok('/admin-api/erp/supplier/create', A, {'name': '华康医疗' + str(random.randint(100, 999)), 'status': 0, 'sort': 1})
unit = ok('/admin-api/erp/product-unit/create', A, {'name': '包' + str(random.randint(100, 999)), 'status': 0})
ecat = ok('/admin-api/erp/product-category/create', A, {'parentId': 0, 'name': '敷料', 'code': 'FL' + str(random.randint(100, 999)), 'sort': 1, 'status': 0})
def material(name, main, gift):
    mid = ok('/admin-api/erp/product/create', A, {'name': name, 'categoryId': ecat, 'unitId': unit, 'status': 0, 'barCode': 'M' + str(random.randint(10**6, 10**7))})
    for wh, cnt in ((1, main), (2, gift)):
        if cnt:
            sid = ok('/admin-api/erp/stock-in/create', A, {'supplierId': sup, 'inTime': int(time.time() * 1000), 'items': [{'warehouseId': wh, 'productId': mid, 'productPrice': 1, 'count': cnt}]})
            call('PUT', f'/admin-api/erp/stock-in/update-status?id={sid}&status=20', A)
    return mid
def erp_stock(mid, wh):
    lst = ok(f'/admin-api/erp/stock/page?pageNo=1&pageSize=10&productId={mid}&warehouseId={wh}', A)['list']
    return float(lst[0]['count']) if lst else 0.0
m_gauze = material('医用纱布', 100, 0)
m_vas = material('凡士林纱布', 50, 10)
root = ok('/admin-api/product/category/create', A, {'parentId': 0, 'name': '敷料', 'picUrl': 'https://example.com/a.png', 'sort': 3, 'status': 0})
sub = ok('/admin-api/product/category/create', A, {'parentId': root, 'name': '纱布', 'picUrl': 'https://example.com/a.png', 'sort': 1, 'status': 0})
brand = ok('/admin-api/product/brand/create', A, {'name': '自营' + str(random.randint(100, 999)), 'picUrl': 'https://example.com/a.png', 'sort': 1, 'status': 0})
def spu(name, price, cost, stock, **extra):
    body = {'name': name, 'keyword': name, 'introduction': name, 'description': name, 'categoryId': sub, 'brandId': brand,
            'picUrl': 'https://example.com/a.png', 'sliderPicUrls': ['https://example.com/a.png'], 'sort': 1, 'specType': False,
            'deliveryTypes': [3], 'giveIntegral': 0, 'subCommissionType': False, 'virtualSalesCount': 0,
            'skus': [{'name': name, 'price': price, 'marketPrice': price, 'costPrice': cost, 'picUrl': 'https://example.com/a.png',
                      'barCode': 'BC' + str(random.randint(10 ** 8, 10 ** 9)), 'stock': stock, 'weight': 0, 'volume': 0}]}
    body.update(extra)
    sid = ok('/admin-api/product/spu/create', A, body)
    call('PUT', '/admin-api/product/spu/update-status', A, {'id': sid, 'status': 1})
    sku = ok(f'/admin-api/product/spu/get-detail?id={sid}', A)['skus'][0]['id']
    return sid, sku
# 纱布：10 件起订，买 2 赠 1（总库存）；凡士林纱布：5 件起订，买 5 赠 1（赠品库）；棉签：门店专售
gauze, gauze_sku = spu('医用纱布', 280, 150, 0, minBuyCount=10, giftBuyCount=2, giftCount=1, giftStockSource=1, supplierId=sup)
vas, vas_sku = spu('凡士林纱布', 550, 300, 0, minBuyCount=5, giftBuyCount=5, giftCount=1, giftStockSource=2, supplierId=sup)
swab, swab_sku = spu('棉签（门店专售）', 100, 40, 50, customerVisible=False)
ok('/admin-api/trade/sku-material/save', A, {'spuId': gauze, 'items': [{'skuId': gauze_sku, 'erpProductId': m_gauze, 'quantity': 1}]}, 'PUT')
ok('/admin-api/trade/sku-material/save', A, {'spuId': vas, 'items': [{'skuId': vas_sku, 'erpProductId': m_vas, 'quantity': 1}]}, 'PUT')
def sku_stock(sid): return ok(f'/admin-api/product/spu/get-detail?id={sid}', A)['skus'][0]['stock']
check('纱布规格库存 = 物料库存', sku_stock(gauze), 100)

# 顾客端可见
page = ok(f'/app-api/product/spu/page?pageNo=1&pageSize=50&categoryId={sub}')
check('顾客端列表不含门店专售', sorted(x['name'] for x in page['list']), ['凡士林纱布', '医用纱布'])
check('顾客端打开门店专售商品被拒绝', call('GET', f'/app-api/product/spu/get-detail?id={swab}', expect_ok=False)['code'], 1008005010)
check('顾客端看到起订量、买赠', [ok(f'/app-api/product/spu/get-detail?id={gauze}')[k] for k in ('minBuyCount', 'giftBuyCount', 'giftCount')], [10, 2, 1])

# 支付应用 + 钱包渠道
apps = call('GET', '/admin-api/pay/app/page?pageNo=1&pageSize=10', A)['data']['list']
app = next((a for a in apps if a['appKey'] == 'mall'), None)
if not app:
    app_id = call('POST', '/admin-api/pay/app/create', A, {'appKey': 'mall', 'name': '住院用品商城', 'status': 0,
        'orderNotifyUrl': BASE + '/app-api/trade/order/update-paid',
        'refundNotifyUrl': BASE + '/admin-api/trade/after-sale/update-refunded',
        'transferNotifyUrl': BASE + '/admin-api/trade/brokerage-withdraw/update-transferred'})['data']
    call('POST', '/admin-api/pay/channel/create', A, {'appId': app_id, 'code': 'wallet', 'status': 0, 'feeRate': 0,
        'config': json.dumps({'name': 'none-config'})})
# 病人下单：起订量、买赠
mobile = '135' + str(random.randint(10000000, 99999999))
call('POST', '/app-api/member/auth/send-sms-code', body={'mobile': mobile, 'scene': 1}, expect_ok=False)
M = ok('/app-api/member/auth/sms-login', body={'mobile': mobile, 'code': '9999'})['accessToken']
ward = ok('/admin-api/trade/delivery/ward/create', A, {'name': '外科' + str(random.randint(100, 999)) + '病区', 'location': 'B 栋', 'sort': 1, 'status': 0})
def order_body(sku, count): return {'items': [{'skuId': sku, 'count': count}], 'deliveryType': 3, 'wardId': ward, 'bedNo': '8',
                                    'receiverName': '家属', 'receiverMobile': mobile, 'pointStatus': False}
def settle_path(body):
    q = {k: v for k, v in body.items() if k != 'items'}
    for i, it in enumerate(body['items']):
        q.update({f'items[{i}].{k}': v for k, v in it.items()})
    return '/app-api/trade/order/settlement?' + urllib.parse.urlencode({k: str(v).lower() if isinstance(v, bool) else v for k, v in q.items()})
r = call('GET', settle_path(order_body(gauze_sku, 5)), M, expect_ok=False)
check('少于起订量不能下单', (r['code'], r['msg']), (1011003010, '商品【医用纱布】10 件起购'))
# 绕过页面直接调下单接口，同样被拦截（顾客手动改数量、改购物车都走这个接口）
r = call('POST', '/app-api/trade/order/create', M, order_body(gauze_sku, 5), expect_ok=False)
check('直接调下单接口也不能少于起订量', (r['code'], r['msg']), (1011003010, '商品【医用纱布】10 件起购'))
r = call('POST', '/app-api/trade/order/create', M, order_body(gauze_sku, 0), expect_ok=False)
check('数量 0 不能下单', r['code'] != 0, True)
st = ok(settle_path(order_body(gauze_sku, 10)), M)
check('结算页显示赠送件数', st['items'][0]['giftCount'], 5)
r = call('POST', '/app-api/trade/order/create', M, order_body(swab_sku, 1), expect_ok=False)
check('门店专售商品不能线上下单', r['code'], 1008005010)
o1 = ok('/app-api/trade/order/create', M, order_body(gauze_sku, 10))
check('纱布：买 10 赠 5，从总库存扣 15', (erp_stock(m_gauze, 1), sku_stock(gauze)), (85.0, 85))
o2 = ok('/app-api/trade/order/create', M, order_body(vas_sku, 5))
check('凡士林：买 5 赠 1，赠品从赠品库扣', (erp_stock(m_vas, 1), erp_stock(m_vas, 2), sku_stock(vas)), (45.0, 9.0, 45))
d = ok(f"/admin-api/trade/order/get-detail?id={o1['id']}", A)
check('订单项记录赠送件数、供应商、成本', (d['items'][0]['giftCount'],), (5,))
call('DELETE', f"/app-api/trade/order/cancel?id={o2['id']}", M)
check('取消订单退回赠品库', (erp_stock(m_vas, 1), erp_stock(m_vas, 2)), (50.0, 10.0))
uid = ok('/app-api/member/user/get', M)['id']
call('PUT', '/admin-api/pay/wallet/update-balance', A, {'userId': uid, 'balance': 100000})
ok('/app-api/pay/order/submit', M, {'id': o1['payOrderId'], 'channelCode': 'wallet'})
ok(f"/app-api/trade/order/get-detail?id={o1['id']}&sync=true", M)

# 门店收银（店员账号）
products = ok('/admin-api/trade/pos/product-list', S)
names = [p['name'] for p in products]
check('收银台包含门店专售商品', '棉签（门店专售）' in names and '医用纱布' in names, True)
check('收银台不返回库存数量', any('stock' in s and s['stock'] is not None for p in products for s in p['skus']), False)
cats = ok('/admin-api/trade/pos/category-list', S)
check('收银台分类含大类和小类', any(c['id'] == root and c['parentId'] == 0 for c in cats) and any(c['id'] == sub and c['parentId'] == root for c in cats), True)
r = call('POST', '/admin-api/trade/pos/create', S, {'items': [{'skuId': gauze_sku, 'count': 3}], 'payType': 1, 'receivedPrice': 500}, expect_ok=False)
check('现金实收不足', r['code'], 1011022003)
pos1 = ok('/admin-api/trade/pos/create', S, {'items': [{'skuId': gauze_sku, 'count': 3}, {'skuId': swab_sku, 'count': 2}], 'payType': 1, 'receivedPrice': 2000})
check('收银：应收、找零、赠送（门店不受起订量限制）', (pos1['totalPrice'], pos1['changePrice'], [i['giftCount'] for i in pos1['items']]), (1040, 960, [1, 0]))
check('收银扣库存：纱布 3+1，棉签 2', (erp_stock(m_gauze, 1), sku_stock(gauze), sku_stock(swab)), (81.0, 81, 48))
summary = ok('/admin-api/trade/pos/summary', S)
check('交班汇总', (summary['orderCount'], summary['totalPrice'], summary['payTypes'][0]['totalPrice']), (1, 1040, 1040))
ok('/admin-api/trade/pos/cancel', S, {'id': pos1['id'], 'reason': '收错了'}, 'PUT')
check('作废退回库存', (erp_stock(m_gauze, 1), sku_stock(gauze), sku_stock(swab)), (85.0, 85, 50))
check('作废后不能再作废', call('PUT', '/admin-api/trade/pos/cancel', S, {'id': pos1['id']}, expect_ok=False)['code'], 1011022004)
pos2 = ok('/admin-api/trade/pos/create', S, {'items': [{'skuId': vas_sku, 'count': 5}], 'payType': 2})
check('收银买赠从赠品库扣', (erp_stock(m_vas, 1), erp_stock(m_vas, 2), pos2['receivedPrice']), (45.0, 9.0, 2750))
check('店员看不到 ERP 库存', call('GET', '/admin-api/erp/stock/page?pageNo=1&pageSize=1', S, expect_ok=False)['code'], 403)

# 供应商对账
month = date.today().strftime('%Y-%m')
rows = ok(f'/admin-api/trade/supplier-settlement/list?month={month}', A)
row = next(x for x in rows if x['supplierId'] == sup)
check('供应商对账：病房 10 件、门店 5 件', (row['onlineCount'], row['posCount'], row['count'], row['giftCount']), (10, 5, 15, 6))
check('供应商对账：销售额、成本', (row['onlinePrice'], row['posPrice'], row['costPrice'], row['giftCostPrice']), (2800, 2750, 10 * 150 + 5 * 300, 5 * 150 + 1 * 300))
check('没有销售的月份返回空列表', ok('/admin-api/trade/supplier-settlement/list?month=2000-01', A), [])
check('店员不能看供应商对账', call('GET', f'/admin-api/trade/supplier-settlement/list?month={month}', S, expect_ok=False)['code'], 403)
print('ALL OK')
