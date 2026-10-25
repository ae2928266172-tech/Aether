"""
住院用品病房下单：后端接口端到端测试

覆盖：病区 -> ERP 物料入库 -> 商品规格配置共享库存物料（不同扣减量、不同名称共用）-> 病人下单（床号必填）
-> 扣减库存 -> 取消退回 -> 钱包支付 -> 开始配送 -> 确认送达；以及门店店员看不到库存、进不了 ERP。

前置：后端以 local 环境启动（短信验证码固定 9999），数据库按 README 导入全部 SQL。
数据库需要是“干净”的（脚本会新建病区、商品等），重复执行前请重新导入 mall-erp-tables.sql、hospital-menu.sql、hospital-init.sql。
用法：python3 scripts/e2e_hospital.py
"""
import json, urllib.request, sys
import random
MOBILE = '156' + str(random.randint(10000000, 99999999))
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
def admin_login(u):
    return call('POST', '/admin-api/system/auth/login', body={'username': u, 'password': 'admin123'})['data']['accessToken']

A = admin_login('admin')
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
# 病区
ward_id = call('POST', '/admin-api/trade/delivery/ward/create', A, {'name': '内科一病区', 'location': '住院部 A 栋 5 楼', 'sort': 1, 'status': 0})['data']
print('ward', ward_id)
# ERP：单位、物料、入库 10
unit_id = call('POST', '/admin-api/erp/product-unit/create', A, {'name': '片', 'status': 0})['data']
cat_id = call('POST', '/admin-api/erp/product-category/create', A, {'parentId': 0, 'name': '护理用品', 'code': 'HL', 'sort': 1, 'status': 0})['data']
mat_id = call('POST', '/admin-api/erp/product/create', A, {'name': '成人护理垫', 'barCode': 'HLD001', 'categoryId': cat_id, 'unitId': unit_id, 'status': 0})['data']
sup_id = call('POST', '/admin-api/erp/supplier/create', A, {'name': '默认供应商', 'status': 0, 'sort': 1})['data']
in_id = call('POST', '/admin-api/erp/stock-in/create', A, {'supplierId': sup_id, 'inTime': 1761350400000, 'items': [{'warehouseId': 1, 'productId': mat_id, 'productPrice': 1, 'count': 10}]})['data']
call('PUT', f'/admin-api/erp/stock-in/update-status?id={in_id}&status=20', A)
# 商品：两个不同名称的商品共用同一物料，规格扣减量不同
cat = call('POST', '/admin-api/product/category/create', A, {'parentId': 0, 'name': '护理用品', 'picUrl': 'https://example.com/a.png', 'sort': 1, 'status': 0})['data']
sub = call('POST', '/admin-api/product/category/create', A, {'parentId': cat, 'name': '护理垫', 'picUrl': 'https://example.com/a.png', 'sort': 1, 'status': 0})['data']
brand = call('POST', '/admin-api/product/brand/create', A, {'name': '医院自营', 'picUrl': 'https://example.com/a.png', 'sort': 1, 'status': 0})['data']
prop = call('POST', '/admin-api/product/property/create', A, {'name': '包装'})['data']
v1 = call('POST', '/admin-api/product/property/value/create', A, {'propertyId': prop, 'name': '单片'})['data']
v2 = call('POST', '/admin-api/product/property/value/create', A, {'propertyId': prop, 'name': '两片装'})['data']
def spu(name, skus):
    return call('POST', '/admin-api/product/spu/create', A, {'name': name, 'keyword': name, 'introduction': name, 'description': name,
        'categoryId': sub, 'brandId': brand, 'picUrl': 'https://example.com/a.png', 'sliderPicUrls': ['https://example.com/a.png'], 'sort': 1,
        'specType': True, 'deliveryTypes': [3], 'giveIntegral': 0, 'subCommissionType': False, 'virtualSalesCount': 0,
        'skus': skus})['data']
def sku(vid, vname, price):
    return {'name': vname, 'properties': [{'propertyId': prop, 'propertyName': '包装', 'valueId': vid, 'valueName': vname}], 'price': price,
            'marketPrice': price, 'costPrice': price, 'picUrl': 'https://example.com/a.png', 'stock': 999, 'weight': 0, 'volume': 0}
spu1 = spu('成人护理垫', [sku(v1, '单片', 300), sku(v2, '两片装', 550)])
spu2 = call('POST', '/admin-api/product/spu/create', A, {'name': '产妇护理垫（同款）', 'keyword': 'x', 'introduction': 'x', 'description': 'x',
        'categoryId': sub, 'brandId': brand, 'picUrl': 'https://example.com/a.png', 'sliderPicUrls': ['https://example.com/a.png'], 'sort': 1,
        'specType': False, 'deliveryTypes': [3], 'giveIntegral': 0, 'subCommissionType': False, 'virtualSalesCount': 0,
        'skus': [{'name': '产妇护理垫', 'price': 320, 'marketPrice': 320, 'costPrice': 1, 'picUrl': 'https://example.com/a.png', 'stock': 999, 'weight': 0, 'volume': 0}]})['data']
for s_ in (spu1, spu2):
    call('PUT', '/admin-api/product/spu/update-status', A, {'id': s_, 'status': 1})
skus1 = call('GET', f'/admin-api/product/spu/get-detail?id={spu1}', A)['data']['skus']
skus2 = call('GET', f'/admin-api/product/spu/get-detail?id={spu2}', A)['data']['skus']
small, big = skus1[0]['id'], skus1[1]['id']; other = skus2[0]['id']
call('PUT', '/admin-api/trade/sku-material/save', A, {'spuId': spu1, 'items': [
    {'skuId': small, 'erpProductId': mat_id, 'quantity': 1}, {'skuId': big, 'erpProductId': mat_id, 'quantity': 2}]})
call('PUT', '/admin-api/trade/sku-material/save', A, {'spuId': spu2, 'items': [{'skuId': other, 'erpProductId': mat_id, 'quantity': 1}]})
def stocks():
    a = {s['id']: s['stock'] for s in call('GET', f'/admin-api/product/spu/get-detail?id={spu1}', A)['data']['skus']}
    b = {s['id']: s['stock'] for s in call('GET', f'/admin-api/product/spu/get-detail?id={spu2}', A)['data']['skus']}
    erp = call('GET', f'/admin-api/erp/stock/page?pageNo=1&pageSize=10&productId={mat_id}', A)['data']['list'][0]['count']
    return a[small], a[big], b[other], erp
print('after mapping (小, 大, 同款, 物料):', stocks()); assert stocks() == (10, 5, 10, 10.0)

# 会员：短信登录（local 环境验证码 9999）
call('POST', '/app-api/member/auth/send-sms-code', body={'mobile': MOBILE, 'scene': 1}, expect_ok=False)
M = call('POST', '/app-api/member/auth/sms-login', body={'mobile': MOBILE, 'code': '9999'})['data']['accessToken']
assert call('GET', f'/app-api/trade/delivery/ward/get?id={ward_id}')['data']['name'] == '内科一病区'
order = {'items': [{'skuId': big, 'count': 1}, {'skuId': other, 'count': 1}], 'pointStatus': False, 'deliveryType': 3,
         'wardId': ward_id, 'receiverName': '张三', 'receiverMobile': MOBILE}
r = call('POST', '/app-api/trade/order/create', M, order, expect_ok=False)
print('no bed no ->', r['code'], r['msg']); assert r['code'] != 0
order['bedNo'] = '12'
created = call('POST', '/app-api/trade/order/create', M, order)['data']
print('order', created)
print('after order (小, 大, 同款, 物料):', stocks()); assert stocks() == (7, 3, 7, 7.0)
detail = call('GET', f"/admin-api/trade/order/get-detail?id={created['id']}", A)['data']
print('admin order:', detail['deliveryType'], detail['wardName'], detail['bedNo'], detail['receiverDetailAddress'])
# 门店店员：看不到库存，进不了 ERP
S = admin_login('store')
sp = call('GET', f'/admin-api/product/spu/get-detail?id={spu1}', S)['data']
print('store sees stock:', sp['stock'], [x['stock'] for x in sp['skus']]); assert sp['stock'] is None
r = call('GET', '/admin-api/erp/stock/page?pageNo=1&pageSize=10', S, expect_ok=False); print('store erp ->', r['code'], r['msg']); assert r['code'] == 403
r = call('PUT', '/admin-api/product/spu/update-status', S, {'id': spu1, 'status': 0}, expect_ok=False); assert r['code'] == 403
# 取消订单，退回库存
call('DELETE', f"/app-api/trade/order/cancel?id={created['id']}", M)
print('after cancel (小, 大, 同款, 物料):', stocks()); assert stocks() == (10, 5, 10, 10.0)
# 再下单并余额支付 -> 配送 -> 送达
call('PUT', '/admin-api/pay/wallet/update-balance', A, {'userId': call('GET', '/app-api/member/user/get', M)['data']['id'], 'balance': 10000}, expect_ok=False)
order['items'] = [{'skuId': small, 'count': 2}]
created = call('POST', '/app-api/trade/order/create', M, order)['data']
r = call('POST', '/app-api/pay/order/submit', M, {'id': created['payOrderId'], 'channelCode': 'wallet'}, expect_ok=False)
print('pay ->', r['code'], r.get('msg'))
call('GET', f"/app-api/trade/order/get-detail?id={created['id']}&sync=true", M)  # 小程序支付完成后会带 sync=true 查询
st = call('GET', f"/admin-api/trade/order/get-detail?id={created['id']}", S)['data']['status']; print('status after pay', st)
if st == 10:
    call('PUT', f"/admin-api/trade/order/ward-delivery?id={created['id']}", S)
    call('PUT', f"/admin-api/trade/order/ward-receive?id={created['id']}", S)
    d = call('GET', f"/admin-api/trade/order/get-detail?id={created['id']}", S)['data']
    print('final status', d['status'], [l['content'] for l in d.get('logs', [])])
print('after paid order (小, 大, 同款, 物料):', stocks()); assert st == 10 and d['status'] == 30 and stocks() == (8, 4, 8, 8.0)
print('ALL OK')
