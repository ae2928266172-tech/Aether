"""
门店收银打折 / 改收款金额、小票设置、营收报表、商品销售明细、仓库台账（入库、出库、出库到门店）：后端接口端到端测试

前置：后端以 local 环境启动，数据库导入全部 SQL（可以在 e2e_hospital.py、e2e_pos.py 之后执行，脚本自己创建数据）。
用法：python3 scripts/e2e_store.py
"""
import json, random, sys, time, urllib.request
from datetime import date, timedelta

BASE = 'http://127.0.0.1:48080'
TODAY = date.today()
CENTER, STORE = 3, 1  # 中心仓库、门店（默认仓库）


def call(method, path, token=None, body=None, expect_ok=True):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header('Content-Type', 'application/json'); req.add_header('tenant-id', '1')
    if token: req.add_header('Authorization', 'Bearer ' + token)
    resp = urllib.request.urlopen(req)
    raw = resp.read()
    if 'json' not in (resp.headers.get('Content-Type') or ''):
        return {'code': 0, 'data': raw}
    r = json.loads(raw)
    if expect_ok and r.get('code') != 0:
        print('FAIL', method, path, body, r); sys.exit(1)
    return r


def ok(path, token=None, body=None, method=None):
    return call(method or ('POST' if body is not None else 'GET'), path, token, body)['data']


def check(name, actual, expected):
    print(('OK  ' if actual == expected else 'FAIL'), name, actual, '' if actual == expected else f'(expected {expected})')
    if actual != expected: sys.exit(1)


def login(u, p='admin123'):
    return ok('/admin-api/system/auth/login', body={'username': u, 'password': p})['accessToken']


A = login('admin'); S = login('store')
suffix = str(random.randint(1000, 9999))

# ---------- 仓库台账：采购入中心仓库，再出库到门店 ----------
unit = ok('/admin-api/erp/product-unit/create', A, {'name': '盒' + suffix, 'status': 0})
ecat = ok('/admin-api/erp/product-category/create', A, {'parentId': 0, 'name': '器械' + suffix, 'code': 'QX' + suffix, 'sort': 1, 'status': 0})
mat = ok('/admin-api/erp/product/create', A, {'name': '一次性输液贴' + suffix, 'categoryId': ecat, 'unitId': unit, 'status': 0,
                                              'barCode': 'S' + suffix, 'standard': '6×7cm', 'purchasePrice': 1.5})
ok('/admin-api/erp/stock-ledger/quick-operate', A, {'type': 'in', 'warehouseId': CENTER, 'remark': '采购', 'items': [{'productId': mat, 'count': 100}]})
ok('/admin-api/erp/stock-ledger/quick-operate', A, {'type': 'out', 'warehouseId': CENTER, 'remark': '报损', 'items': [{'productId': mat, 'count': 5}]})
ok('/admin-api/erp/stock-ledger/quick-operate', A, {'type': 'move', 'warehouseId': CENTER, 'toWarehouseId': STORE, 'remark': '今日补货',
                                                    'items': [{'productId': mat, 'count': 40}]})
r = call('POST', '/admin-api/erp/stock-ledger/quick-operate', A, {'type': 'move', 'warehouseId': CENTER, 'toWarehouseId': CENTER,
                                                                  'items': [{'productId': mat, 'count': 1}]}, expect_ok=False)
check('调拨到同一个仓库被拒绝', r['code'] != 0, True)
def ledger(wh, begin=TODAY, end=TODAY):
    rows = ok(f'/admin-api/erp/stock-ledger/list?warehouseId={wh}&beginDate={begin}&endDate={end}&keyword={suffix}', A)
    row = next(x for x in rows if x['productId'] == mat)
    return float(row['openingCount']), float(row['inCount']), float(row['outCount']), float(row['closingCount'])
check('中心仓库台账（期初, 入, 出, 结存）', ledger(CENTER), (0.0, 100.0, 45.0, 55.0))
check('门店台账（期初, 入, 出, 结存）', ledger(STORE), (0.0, 40.0, 0.0, 40.0))
check('昨天为止的台账（结存倒推）', ledger(CENTER, TODAY - timedelta(days=7), TODAY - timedelta(days=1)), (0.0, 0.0, 0.0, 0.0))
check('店员不能看仓库台账', call('GET', f'/admin-api/erp/stock-ledger/list?warehouseId=1&beginDate={TODAY}&endDate={TODAY}', S, expect_ok=False)['code'], 403)
xls = call('GET', f'/admin-api/erp/stock-ledger/export-excel?warehouseId={CENTER}&beginDate={TODAY}&endDate={TODAY}', A)['data']
check('台账导出 Excel', len(xls) > 1000, True)

# ---------- 商品：绑定物料，带医疗器械信息 ----------
cat = ok('/admin-api/product/category/create', A, {'parentId': 0, 'name': '器械' + suffix, 'picUrl': 'https://example.com/a.png', 'sort': 5, 'status': 0})
sub = ok('/admin-api/product/category/create', A, {'parentId': cat, 'name': '敷贴' + suffix, 'picUrl': 'https://example.com/a.png', 'sort': 1, 'status': 0})
brand = ok('/admin-api/product/brand/create', A, {'name': '品牌' + suffix, 'picUrl': 'https://example.com/a.png', 'sort': 1, 'status': 0})
spu = ok('/admin-api/product/spu/create', A, {
    'name': '一次性输液贴' + suffix, 'keyword': 'x', 'introduction': 'x', 'description': 'x', 'categoryId': sub, 'brandId': brand,
    'picUrl': 'https://example.com/a.png', 'sliderPicUrls': ['https://example.com/a.png'], 'sort': 1, 'specType': False,
    'deliveryTypes': [3], 'giveIntegral': 0, 'subCommissionType': False, 'virtualSalesCount': 0,
    'registrationNo': '苏械注准20262140001', 'productionLicenseNo': '苏药监械生产许20200001号', 'registrant': '某某医疗用品有限公司',
    'productionAddress': '江苏省某某市某某路 1 号',
    'skus': [{'name': 'x', 'price': 300, 'marketPrice': 300, 'costPrice': 150, 'picUrl': 'https://example.com/a.png', 'stock': 0, 'weight': 0, 'volume': 0}]})
call('PUT', '/admin-api/product/spu/update-status', A, {'id': spu, 'status': 1})
detail = ok(f'/admin-api/product/spu/get-detail?id={spu}', A)
check('商品保存医疗器械信息', (detail['registrationNo'], detail['productionAddress']), ('苏械注准20262140001', '江苏省某某市某某路 1 号'))
sku = detail['skus'][0]['id']
ok('/admin-api/trade/sku-material/save', A, {'spuId': spu, 'items': [{'skuId': sku, 'erpProductId': mat, 'quantity': 1}]}, 'PUT')
check('商品可售库存 = 门店库存（不含中心仓库）', ok(f'/admin-api/product/spu/get-detail?id={spu}', A)['skus'][0]['stock'], 40)

# ---------- 收银：打折、改收款金额 ----------
o1 = ok('/admin-api/trade/pos/create', S, {'items': [{'skuId': sku, 'count': 3}], 'payType': 1, 'receivedPrice': 1000, 'discountRate': 90})
check('9 折：商品金额 / 优惠 / 应收 / 找零', (o1['totalPrice'], o1['discountPrice'], o1['payPrice'], o1['changePrice']), (900, 90, 810, 190))
check('小票商品带医疗器械信息', o1['items'][0]['registrationNo'], '苏械注准20262140001')
o2 = ok('/admin-api/trade/pos/create', S, {'items': [{'skuId': sku, 'count': 2}], 'payType': 2, 'payPrice': 500})
check('改收款金额：只改本单应收', (o2['totalPrice'], o2['payPrice'], o2['priceAdjusted'], o2['items'][0]['price']), (600, 500, True, 300))
r = call('POST', '/admin-api/trade/pos/create', S, {'items': [{'skuId': sku, 'count': 1}], 'payType': 2, 'payPrice': 999}, expect_ok=False)
check('收款金额不能高于商品金额', r['code'], 1011022007)
o3 = ok('/admin-api/trade/pos/create', S, {'items': [{'skuId': sku, 'count': 1}], 'payType': 2})
check('下一单不受影响，按原价', o3['payPrice'], 300)
check('库存照常扣减（40 - 3 - 2 - 1）', ok(f'/admin-api/product/spu/get-detail?id={spu}', A)['skus'][0]['stock'], 34)
summary = ok('/admin-api/trade/pos/summary?all=true', A)
check('交班汇总按实收统计、记录优惠', summary['discountPrice'] >= 190, True)

# 没有打折、改价权限的收银员
role = ok('/admin-api/system/role/create', A, {'name': '收银员' + suffix, 'code': 'cashier' + suffix, 'sort': 20, 'status': 0})
menus = [m['id'] for m in ok('/admin-api/system/menu/list', A)
         if m.get('permission') in ('trade:pos:create', 'trade:pos:query') or m['name'] in ('门店收银', '订单中心', '商城管理')]
ok('/admin-api/system/permission/assign-role-menu', A, {'roleId': role, 'menuIds': menus})
uid = ok('/admin-api/system/user/create', A, {'username': 'cashier' + suffix, 'nickname': '收银员' + suffix, 'password': 'admin123', 'deptId': 103})
ok('/admin-api/system/permission/assign-user-role', A, {'userId': uid, 'roleIds': [role]})
C = login('cashier' + suffix)
check('没有打折权限', call('POST', '/admin-api/trade/pos/create', C, {'items': [{'skuId': sku, 'count': 1}], 'payType': 2, 'discountRate': 80}, expect_ok=False)['code'], 1011022005)
check('没有改价权限', call('POST', '/admin-api/trade/pos/create', C, {'items': [{'skuId': sku, 'count': 1}], 'payType': 2, 'payPrice': 100}, expect_ok=False)['code'], 1011022006)
check('没有权限也能按原价收银', ok('/admin-api/trade/pos/create', C, {'items': [{'skuId': sku, 'count': 1}], 'payType': 2})['payPrice'], 300)

# ---------- 小票设置 ----------
cfg = ok('/admin-api/trade/pos/receipt-config', S)
check('小票默认：自动打印、语音播报、58mm', (cfg['autoPrint'], cfg['voice'], cfg['paperWidth']), (True, True, 58))
check('店员不能改小票设置', call('PUT', '/admin-api/trade/pos/receipt-config', S, cfg, expect_ok=False)['code'], 403)
cfg.update({'title': 'Aether 住院用品店', 'footerText': '单号 {单号}，谢谢惠顾', 'showDeviceInfo': True, 'deviceFields': ['registrationNo', 'registrant'], 'copies': 2})
ok('/admin-api/trade/pos/receipt-config', A, cfg, 'PUT')
cfg2 = ok('/admin-api/trade/pos/receipt-config', S)
check('小票设置已保存', (cfg2['title'], cfg2['showDeviceInfo'], cfg2['deviceFields'], cfg2['copies']), ('Aether 住院用品店', True, ['registrationNo', 'registrant'], 2))
check('补打：收银单详情带商品', len(ok(f"/admin-api/trade/pos/get?id={o1['id']}", S)['items']), 1)

# ---------- 营收报表、商品销售明细 ----------
day = ok(f'/admin-api/trade/report/revenue?beginDate={TODAY}&endDate={TODAY}&period=day', A)
today_row, total = day[0], day[-1]
check('日报：一天 + 合计两行', (len(day), total['period']), (2, '合计'))
check('日报门店实收包含打折、改价后的金额', today_row['posPrice'] >= 810 + 500 + 300 + 300, True)
check('合计 = 线上 + 门店', total['totalPrice'], total['onlinePrice'] + total['posPrice'])
week = ok(f'/admin-api/trade/report/revenue?beginDate={TODAY - timedelta(days=20)}&endDate={TODAY}&period=week', A)
check('周报合计与日报一致', week[-1]['totalPrice'], total['totalPrice'])
month = ok(f'/admin-api/trade/report/revenue?beginDate={TODAY.replace(day=1)}&endDate={TODAY}&period=month', A)
check('月报一行 + 合计', len(month), 2)
check('店员不能看营收报表', call('GET', f'/admin-api/trade/report/revenue?beginDate={TODAY}&endDate={TODAY}', S, expect_ok=False)['code'], 403)
xls = call('GET', f'/admin-api/trade/report/revenue/export-excel?beginDate={TODAY}&endDate={TODAY}&period=week', A)['data']
check('导出周报 Excel', len(xls) > 1000, True)
q = f'time={TODAY}%2000:00:00&time={TODAY}%2023:59:59&keyword={suffix}'
sales = ok(f'/admin-api/trade/report/product-sales/summary?{q}', A)
check('商品销售汇总：件数、单数', (sales[0]['count'], sales[0]['posCount'], sales[0]['orderCount']), (7, 7, 4))
page = ok(f'/admin-api/trade/report/product-sales/page?{q}&pageNo=1&pageSize=2', A)
check('销售明细分页：总数、每页', (page['total'], len(page['list'])), (4, 2))
check('明细带单号、时间、数量', all(x['orderNo'] and x['time'] and x['count'] for x in page['list']), True)
check('明细按分摊后金额', sorted(x['price'] for x in ok(f'/admin-api/trade/report/product-sales/page?{q}&pageNo=1&pageSize=10', A)['list']), [300, 300, 500, 810])
xls = call('GET', f'/admin-api/trade/report/product-sales/export-excel?{q}', A)['data']
check('导出销售明细 Excel', len(xls) > 1000, True)
print('ALL OK')
