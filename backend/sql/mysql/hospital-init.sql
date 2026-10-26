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

-- 顾客端可见、赠品库：默认值
ALTER TABLE product_spu MODIFY customer_visible bit(1) NOT NULL DEFAULT b'1' COMMENT '顾客端是否可见：否则只在门店收银台售卖';
ALTER TABLE erp_warehouse MODIFY gift_status bit(1) NOT NULL DEFAULT b'0' COMMENT '是否赠品库';
ALTER TABLE trade_pos_order ADD UNIQUE INDEX uk_no (no), ADD INDEX idx_create_time (create_time);
ALTER TABLE trade_pos_order_item ADD INDEX idx_order_id (order_id);
ALTER TABLE trade_order_item ADD INDEX idx_supplier_id (supplier_id);


-- 默认仓库：商城下单从默认仓库扣减共享库存物料
INSERT INTO erp_warehouse (id, name, address, sort, remark, principal, status, default_status, creator, updater, deleted, tenant_id)
VALUES (1, '住院部仓库', '', 1, '商城订单从默认仓库扣减库存', '', 0, b'1', '1', '1', b'0', 1);

-- 赠品库：买赠的赠品可以设置从赠品库扣减
INSERT INTO erp_warehouse (id, name, address, sort, remark, principal, status, default_status, gift_status, creator, updater, deleted, tenant_id)
VALUES (2, '赠品库', '', 2, '买赠的赠品可以设置从这里扣减库存', '', 0, b'0', b'1', '1', '1', b'0', 1);

-- 交易配置：默认关闭分销、包邮；扫码配送的顾客端叫法（后台「交易配置 → 扫码配送」可改）
DELETE FROM trade_config WHERE tenant_id = 1;
INSERT INTO trade_config (after_sale_refund_reasons, after_sale_return_reasons, delivery_express_free_enabled, delivery_express_free_price,
                          delivery_pick_up_enabled, ward_delivery_name, ward_area_label, ward_spot_label, ward_spot_required,
                          brokerage_enabled, brokerage_enabled_condition, brokerage_bind_mode, brokerage_poster_urls,
                          brokerage_first_percent, brokerage_second_percent, brokerage_withdraw_min_price, brokerage_withdraw_fee_percent,
                          brokerage_frozen_days, brokerage_withdraw_types, creator, updater, deleted, tenant_id)
VALUES ('["商品错发","商品破损","不想要了"]', '["商品错发","商品破损"]', b'0', 0,
        b'0', '送到病房', '病区', '床号', b'1',
        b'0', 1, 1, '[]', 0, 0, 0, 0, 0, '1', '1', '1', b'0', 1);

-- 字典：门店收银的收款方式、收银单状态；库存明细类型【门店收银出库】【买赠赠品出库】
DELETE FROM system_dict_type WHERE type IN ('trade_pos_pay_type', 'trade_pos_order_status');
DELETE FROM system_dict_data WHERE dict_type IN ('trade_pos_pay_type', 'trade_pos_order_status');
INSERT INTO system_dict_type (name, type, status, remark, creator, updater, deleted, deleted_time)
VALUES ('门店收银收款方式', 'trade_pos_pay_type', 0, '', '1', '1', b'0', NULL),
       ('门店收银单状态', 'trade_pos_order_status', 0, '', '1', '1', b'0', NULL);
INSERT INTO system_dict_data (sort, label, value, dict_type, status, color_type, css_class, remark, creator, updater, deleted)
VALUES (1, '现金', '1', 'trade_pos_pay_type', 0, 'warning', '', '', '1', '1', b'0'),
       (2, '微信', '2', 'trade_pos_pay_type', 0, 'success', '', '', '1', '1', b'0'),
       (3, '支付宝', '3', 'trade_pos_pay_type', 0, 'primary', '', '', '1', '1', b'0'),
       (9, '其他', '9', 'trade_pos_pay_type', 0, 'info', '', '', '1', '1', b'0'),
       (1, '已完成', '10', 'trade_pos_order_status', 0, 'success', '', '', '1', '1', b'0'),
       (2, '已作废', '20', 'trade_pos_order_status', 0, 'danger', '', '', '1', '1', b'0');
DELETE FROM system_dict_data WHERE dict_type = 'erp_stock_record_biz_type' AND value IN ('92', '93', '94', '95');
INSERT INTO system_dict_data (sort, label, value, dict_type, status, color_type, css_class, remark, creator, updater, deleted)
VALUES (92, '门店收银出库', '92', 'erp_stock_record_biz_type', 0, '', '', '', '1', '1', b'0'),
       (93, '门店收银出库（作废）', '93', 'erp_stock_record_biz_type', 0, 'danger', '', '', '1', '1', b'0'),
       (94, '买赠赠品出库', '94', 'erp_stock_record_biz_type', 0, 'warning', '', '', '1', '1', b'0'),
       (95, '买赠赠品出库（退回）', '95', 'erp_stock_record_biz_type', 0, 'danger', '', '', '1', '1', b'0');

-- 默认装修模板：住院用品商城（蓝色主题，首页搜索 + 公告 + 商品卡片，我的页面用户卡片 + 订单）
-- 上架商品后，在【商城系统 - 商城首页 - 装修模板】里编辑首页，给“商品卡片”选择要展示的商品
DELETE FROM promotion_diy_page WHERE template_id = 1;
DELETE FROM promotion_diy_template WHERE id = 1;
INSERT INTO promotion_diy_template (id, name, used, used_time, remark, preview_pic_urls, property, creator, updater, deleted, tenant_id)
VALUES (1, '住院用品商城', b'1', NOW(), '默认模板', '[]', '{"page":{"description":"","backgroundColor":"#f5f5f5","backgroundImage":""},"navigationBar":{"bgType":"color","bgColor":"#0d9488","bgImg":"","styleType":"normal","showType":"always","alwaysShow":true,"mpCells":[{"type":"text","textColor":"#ffffff","text":"住院用品商城","width":6,"height":1}],"otherCells":[{"type":"text","textColor":"#ffffff","text":"住院用品商城","width":6,"height":1}]},"tabBar":{"theme":"teal","style":{"bgType":"color","bgColor":"#fff","color":"#282828","activeColor":"#0d9488"},"items":[{"text":"首页","url":"/pages/index/index","iconUrl":"/static/local/tabbar/home.png","activeIconUrl":"/static/local/tabbar/home-active.png"},{"text":"分类","url":"/pages/index/category","iconUrl":"/static/local/tabbar/category.png","activeIconUrl":"/static/local/tabbar/category-active.png"},{"text":"购物车","url":"/pages/index/cart","iconUrl":"/static/local/tabbar/cart.png","activeIconUrl":"/static/local/tabbar/cart-active.png"},{"text":"我的","url":"/pages/index/user","iconUrl":"/static/local/tabbar/user.png","activeIconUrl":"/static/local/tabbar/user-active.png"}]},"components":[]}', '1', '1', b'0', 1);
INSERT INTO promotion_diy_page (id, template_id, name, remark, preview_pic_urls, property, creator, updater, deleted, tenant_id)
VALUES (1, 1, '首页', '', '[]', '{"page":{"description":"","backgroundColor":"#f5f5f5","backgroundImage":""},"navigationBar":{"bgType":"color","bgColor":"#0d9488","bgImg":"","styleType":"normal","showType":"always","alwaysShow":true,"mpCells":[{"type":"text","textColor":"#ffffff","text":"住院用品商城","width":6,"height":1}],"otherCells":[{"type":"text","textColor":"#ffffff","text":"住院用品商城","width":6,"height":1}]},"components":[{"id":"SearchBar","property":{"height":28,"showScan":false,"borderRadius":14,"placeholder":"搜索住院用品","placeholderPosition":"left","backgroundColor":"rgb(238, 238, 238)","textColor":"rgb(150, 151, 153)","hotKeywords":[],"style":{"bgType":"color","bgColor":"#fff","marginBottom":8,"paddingTop":8,"paddingRight":8,"paddingBottom":8,"paddingLeft":8}}},{"id":"NoticeBar","property":{"iconUrl":"/static/local/notice.png","contents":[{"text":"下单请填写床号，工作人员会送到床边","url":""}],"backgroundColor":"#fff","textColor":"#333","style":{"bgType":"color","bgColor":"#fff","marginBottom":8}}},{"id":"ProductCard","property":{"layoutType":"twoCol","fields":{"name":{"show":true,"color":"#000"},"introduction":{"show":true,"color":"#999"},"price":{"show":true,"color":"#ff3000"},"marketPrice":{"show":false,"color":"#c4c4c4"},"salesCount":{"show":true,"color":"#c4c4c4"},"stock":{"show":false,"color":"#c4c4c4"}},"badge":{"show":false,"imgUrl":""},"btnBuy":{"type":"text","text":"购买","bgBeginColor":"#0d9488","bgEndColor":"#14b8a6","imgUrl":""},"borderRadiusTop":6,"borderRadiusBottom":6,"space":8,"spuIds":[],"style":{"bgType":"color","bgColor":"","marginLeft":8,"marginRight":8,"marginBottom":8}}}]}', '1', '1', b'0', 1),
       (2, 1, '我的', '', '[]', '{"page":{"description":"","backgroundColor":"#f5f5f5","backgroundImage":""},"navigationBar":{"bgType":"color","bgColor":"#0d9488","bgImg":"","styleType":"normal","showType":"always","alwaysShow":true,"mpCells":[{"type":"text","textColor":"#ffffff","text":"住院用品商城","width":6,"height":1}],"otherCells":[{"type":"text","textColor":"#ffffff","text":"住院用品商城","width":6,"height":1}]},"components":[{"id":"UserCard","property":{"style":{"bgType":"color","bgColor":"","marginBottom":8}}},{"id":"UserOrder","property":{"style":{"bgType":"color","bgColor":"","marginLeft":8,"marginRight":8,"marginBottom":8}}}]}', '1', '1', b'0', 1);
