-- 住院用品病房下单：新增菜单、按钮权限，以及预置角色和演示账号
-- 商城、会员、支付、ERP 的菜单已包含在 ruoyi-vue-pro.sql 中，这里只补充新增功能
SET NAMES utf8mb4;

DELETE FROM system_menu WHERE id BETWEEN 10000 AND 10099;

-- 1. 病区管理：交易中心 - 配送管理 - 病区管理
SET @delivery_menu_id = (SELECT id FROM system_menu WHERE name = '配送管理' AND path = 'delivery' AND deleted = 0 LIMIT 1);
INSERT INTO system_menu (id, name, permission, type, sort, parent_id, path, icon, component, component_name, status, visible, keep_alive, always_show, creator, updater, deleted)
VALUES (10000, '病区管理', '', 2, 0, @delivery_menu_id, 'ward', 'ep:first-aid-kit', 'mall/trade/delivery/ward/index', 'DeliveryWard', 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10001, '病区查询', 'trade:delivery:ward:query', 3, 1, 10000, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10002, '病区创建', 'trade:delivery:ward:create', 3, 2, 10000, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10003, '病区更新', 'trade:delivery:ward:update', 3, 3, 10000, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10004, '病区删除', 'trade:delivery:ward:delete', 3, 4, 10000, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0');

-- 2. 订单列表：病房配送（开始配送、确认送达）
SET @order_menu_id = (SELECT id FROM system_menu WHERE component = 'mall/trade/order/index' AND deleted = 0 LIMIT 1);
INSERT INTO system_menu (id, name, permission, type, sort, parent_id, path, icon, component, component_name, status, visible, keep_alive, always_show, creator, updater, deleted)
VALUES (10010, '病房配送', 'trade:order:ward-delivery', 3, 10, @order_menu_id, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0');

-- 3. 商品列表：查看库存（门店不分配即看不到库存）、共享库存物料
SET @spu_menu_id = (SELECT id FROM system_menu WHERE component = 'mall/product/spu/index' AND deleted = 0 LIMIT 1);
INSERT INTO system_menu (id, name, permission, type, sort, parent_id, path, icon, component, component_name, status, visible, keep_alive, always_show, creator, updater, deleted)
VALUES (10020, '商品库存查看', 'product:spu:stock', 3, 10, @spu_menu_id, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10021, '库存物料查询', 'trade:sku-material:query', 3, 11, @spu_menu_id, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10022, '库存物料配置', 'trade:sku-material:update', 3, 12, @spu_menu_id, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0');

-- 4. 门店收银（触屏收银台、收银记录、交班汇总）、供应商对账：放在订单中心下
SET @order_center_id = (SELECT parent_id FROM system_menu WHERE id = @order_menu_id);
INSERT INTO system_menu (id, name, permission, type, sort, parent_id, path, icon, component, component_name, status, visible, keep_alive, always_show, creator, updater, deleted)
VALUES (10030, '门店收银', '', 2, 0, @order_center_id, 'pos', 'ep:money', 'mall/trade/pos/index', 'TradePos', 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10031, '收银下单', 'trade:pos:create', 3, 1, 10030, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10032, '收银记录查询', 'trade:pos:query', 3, 2, 10030, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10033, '收银单作废', 'trade:pos:cancel', 3, 3, 10030, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10040, '供应商对账', '', 2, 20, @order_center_id, 'supplier-settlement', 'ep:document-checked', 'mall/trade/supplierSettlement/index', 'TradeSupplierSettlement', 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10041, '供应商对账查询', 'trade:supplier-settlement:query', 3, 1, 10040, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10042, '供应商对账导出', 'trade:supplier-settlement:export', 3, 2, 10040, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0'),
       -- 收银打折、改收款金额、小票设置：按钮权限，在「角色管理」里分配
       (10034, '收银整单打折', 'trade:pos:discount', 3, 4, 10030, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10035, '收银修改收款金额', 'trade:pos:update-price', 3, 5, 10030, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10036, '小票设置', 'trade:pos:receipt-config', 3, 6, 10030, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0'),
       -- 营收报表：日报、周报、月报，商品销售明细
       (10050, '营收报表', '', 2, 21, @order_center_id, 'report', 'ep:trend-charts', 'mall/trade/report/index', 'TradeReport', 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10051, '营收报表查询', 'trade:report:query', 3, 1, 10050, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10052, '营收报表导出', 'trade:report:export', 3, 2, 10050, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0');

-- 4.1 仓库台账：进销存下，像表格一样看期初、入库、出库、结存，并快速入库、出库、出库到门店
SET @erp_menu_id = (SELECT id FROM system_menu WHERE parent_id = 0 AND path = '/erp' AND deleted = 0 LIMIT 1);
INSERT INTO system_menu (id, name, permission, type, sort, parent_id, path, icon, component, component_name, status, visible, keep_alive, always_show, creator, updater, deleted)
VALUES (10060, '仓库台账', '', 2, 1, @erp_menu_id, 'stock-ledger', 'ep:notebook', 'erp/stock/ledger/index', 'ErpStockLedger', 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10061, '仓库台账查询', 'erp:stock-ledger:query', 3, 1, 10060, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0'),
       (10062, '仓库出入库', 'erp:stock-ledger:operate', 3, 2, 10060, '', '', NULL, NULL, 0, b'1', b'1', b'1', '1', '1', b'0');

-- 5. 预置角色（租户 1）
--   门店店员：门店收银（可以打折、改收款金额）、处理订单、病房配送，只能查看商品（不含库存），没有 ERP 进销存菜单
--   后台管理员：商城、会员、支付、ERP 进销存的全部菜单，可以查看、修改库存
DELETE FROM system_role WHERE id IN (10001, 10002);
DELETE FROM system_role_menu WHERE role_id IN (10001, 10002);
INSERT INTO system_role (id, name, code, sort, data_scope, data_scope_dept_ids, status, type, remark, creator, updater, deleted, tenant_id)
VALUES (10001, '门店店员', 'store_staff', 11, 1, '', 0, 2, '门店使用：门店收银、处理订单和病房配送，不能查看、修改库存', '1', '1', b'0', 1),
       (10002, '后台管理员', 'back_office', 12, 1, '', 0, 2, '后台使用：管理商品、库存（ERP 进销存）、共享库存物料', '1', '1', b'0', 1);

-- 门店店员：指定的页面和按钮，再补上它们的上级目录
INSERT INTO system_role_menu (role_id, menu_id, creator, updater, deleted, tenant_id)
WITH RECURSIVE picked AS (
    SELECT id, parent_id FROM system_menu
    WHERE deleted = 0 AND (
        component IN ('mall/product/spu/index', 'mall/trade/order/index', 'mall/trade/afterSale/index',
                      'mall/trade/delivery/ward/index', 'mall/trade/delivery/pickUpOrder/index', 'mall/trade/pos/index')
        OR permission IN ('product:spu:query', 'product:category:query',
                          'trade:order:query', 'trade:order:update', 'trade:order:pick-up', 'trade:order:ward-delivery',
                          'trade:after-sale:query', 'trade:delivery:ward:query',
                          'trade:pos:create', 'trade:pos:query', 'trade:pos:cancel',
                          'trade:pos:discount', 'trade:pos:update-price'))
    UNION
    SELECT m.id, m.parent_id FROM system_menu m JOIN picked p ON m.id = p.parent_id
)
SELECT DISTINCT 10001, id, '1', '1', b'0', 1 FROM picked;

-- 后台管理员：商城、会员、支付、ERP 整棵菜单树
INSERT INTO system_role_menu (role_id, menu_id, creator, updater, deleted, tenant_id)
WITH RECURSIVE tree AS (
    SELECT id FROM system_menu WHERE deleted = 0 AND parent_id = 0 AND path IN ('/mall', '/member', '/pay', '/erp')
    UNION
    SELECT m.id FROM system_menu m JOIN tree t ON m.parent_id = t.id WHERE m.deleted = 0
)
SELECT DISTINCT 10002, id, '1', '1', b'0', 1 FROM tree;

-- 6. 演示账号，密码均为 admin123（上线前请修改密码或删除）
DELETE FROM system_users WHERE id IN (10001, 10002);
DELETE FROM system_user_role WHERE user_id IN (10001, 10002);
INSERT INTO system_users (id, username, password, nickname, remark, dept_id, post_ids, email, mobile, sex, avatar, status, creator, updater, deleted, tenant_id)
VALUES (10001, 'store', '$2a$04$.vd8nPeLwxt6hnSzmAoAyul8BOLX7Cib6QhcxRe30rfvrIPQHH1OG', '门店店员', '演示账号，密码 admin123', 103, '[]', '', '', 0, '', 0, '1', '1', b'0', 1),
       (10002, 'backoffice', '$2a$04$.vd8nPeLwxt6hnSzmAoAyul8BOLX7Cib6QhcxRe30rfvrIPQHH1OG', '后台管理员', '演示账号，密码 admin123', 103, '[]', '', '', 0, '', 0, '1', '1', b'0', 1);
INSERT INTO system_user_role (user_id, role_id, creator, updater, deleted, tenant_id)
VALUES (10001, 10001, '1', '1', b'0', 1),
       (10002, 10002, '1', '1', b'0', 1);

-- 7. 品牌与菜单精简：隐藏本项目用不到的上游模块和外链菜单（status=1 停用，可在「菜单管理」重新启用）
UPDATE system_menu SET status = 1
WHERE parent_id = 0 AND deleted = 0
  AND (id IN (194, 347, 348)
    OR path IN ('/report', '/bpm', '/crm', '/wms', '/mes', '/oa', '/hrm', '/fms', '/pms',
                '/ai', '/iot', '/im', '/mp', '/cms'));
UPDATE system_menu SET name = '商城管理' WHERE parent_id = 0 AND path = '/mall';
UPDATE system_menu SET name = '进销存', icon = 'ep:box' WHERE parent_id = 0 AND path = '/erp';

-- 默认租户改成自己的品牌名（登录时租户名与前端 VITE_APP_DEFAULT_LOGIN_TENANT 一致），停用上游演示租户
UPDATE system_tenant SET name = 'Aether', contact_name = '管理员' WHERE id = 1;
UPDATE system_tenant SET status = 1 WHERE id IN (121, 122);
UPDATE system_users SET nickname = '管理员', remark = '超级管理员' WHERE id = 1;
