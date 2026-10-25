-- 住院用品病房下单：业务初始化数据
-- 导入顺序：ruoyi-vue-pro.sql -> quartz.sql -> mall-erp-tables.sql -> hospital-menu.sql -> hospital-init.sql
SET NAMES utf8mb4;

-- 字典：新增配送方式【病房配送】、库存明细类型【商城订单出库】
DELETE FROM system_dict_data WHERE dict_type = 'trade_delivery_type' AND value = '3';
INSERT INTO system_dict_data (sort, label, value, dict_type, status, color_type, css_class, remark, creator, updater, deleted)
VALUES (3, '病房配送', '3', 'trade_delivery_type', 0, 'success', '', '扫病区二维码下单，送到床位', '1', '1', b'0');
DELETE FROM system_dict_data WHERE dict_type = 'erp_stock_record_biz_type' AND value IN ('90', '91');
INSERT INTO system_dict_data (sort, label, value, dict_type, status, color_type, css_class, remark, creator, updater, deleted)
VALUES (90, '商城订单出库', '90', 'erp_stock_record_biz_type', 0, '', '', '', '1', '1', b'0'),
       (91, '商城订单出库（取消）', '91', 'erp_stock_record_biz_type', 0, 'danger', '', '', '1', '1', b'0');

-- 索引
ALTER TABLE trade_sku_material ADD INDEX idx_spu_id (spu_id), ADD INDEX idx_sku_id (sku_id), ADD INDEX idx_erp_product_id (erp_product_id);
ALTER TABLE trade_order ADD INDEX idx_ward_id (ward_id);
ALTER TABLE erp_stock ADD INDEX idx_product_warehouse (product_id, warehouse_id);

-- 默认仓库：商城下单从默认仓库扣减共享库存物料
INSERT INTO erp_warehouse (id, name, address, sort, remark, principal, status, default_status, creator, updater, deleted, tenant_id)
VALUES (1, '住院部仓库', '', 1, '商城订单从默认仓库扣减库存', '', 0, b'1', '1', '1', b'0', 1);
