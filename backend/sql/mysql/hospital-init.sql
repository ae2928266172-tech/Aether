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

-- 默认装修模板：住院用品商城（蓝色主题，首页搜索 + 公告 + 商品卡片，我的页面用户卡片 + 订单）
-- 上架商品后，在【商城系统 - 商城首页 - 装修模板】里编辑首页，给“商品卡片”选择要展示的商品
DELETE FROM promotion_diy_page WHERE template_id = 1;
DELETE FROM promotion_diy_template WHERE id = 1;
INSERT INTO promotion_diy_template (id, name, used, used_time, remark, preview_pic_urls, property, creator, updater, deleted, tenant_id)
VALUES (1, '住院用品商城', b'1', NOW(), '默认模板', '[]', '{"page":{"description":"","backgroundColor":"#f5f5f5","backgroundImage":""},"navigationBar":{"bgType":"color","bgColor":"#1677ff","bgImg":"","styleType":"normal","showType":"always","alwaysShow":true,"mpCells":[{"type":"text","textColor":"#ffffff","text":"住院用品商城","width":6,"height":1}],"otherCells":[{"type":"text","textColor":"#ffffff","text":"住院用品商城","width":6,"height":1}]},"tabBar":{"theme":"blue","style":{"bgType":"color","bgColor":"#fff","color":"#282828","activeColor":"#1677ff"},"items":[{"text":"首页","url":"/pages/index/index","iconUrl":"http://mall.yudao.iocoder.cn/static/images/1-001.png","activeIconUrl":"http://mall.yudao.iocoder.cn/static/images/1-002.png"},{"text":"分类","url":"/pages/index/category","iconUrl":"http://mall.yudao.iocoder.cn/static/images/2-001.png","activeIconUrl":"http://mall.yudao.iocoder.cn/static/images/2-002.png"},{"text":"购物车","url":"/pages/index/cart","iconUrl":"http://mall.yudao.iocoder.cn/static/images/3-001.png","activeIconUrl":"http://mall.yudao.iocoder.cn/static/images/3-002.png"},{"text":"我的","url":"/pages/index/user","iconUrl":"http://mall.yudao.iocoder.cn/static/images/4-001.png","activeIconUrl":"http://mall.yudao.iocoder.cn/static/images/4-002.png"}]},"components":[]}', '1', '1', b'0', 1);
INSERT INTO promotion_diy_page (id, template_id, name, remark, preview_pic_urls, property, creator, updater, deleted, tenant_id)
VALUES (1, 1, '首页', '', '[]', '{"page":{"description":"","backgroundColor":"#f5f5f5","backgroundImage":""},"navigationBar":{"bgType":"color","bgColor":"#1677ff","bgImg":"","styleType":"normal","showType":"always","alwaysShow":true,"mpCells":[{"type":"text","textColor":"#ffffff","text":"住院用品商城","width":6,"height":1}],"otherCells":[{"type":"text","textColor":"#ffffff","text":"住院用品商城","width":6,"height":1}]},"components":[{"id":"SearchBar","property":{"height":28,"showScan":false,"borderRadius":14,"placeholder":"搜索住院用品","placeholderPosition":"left","backgroundColor":"rgb(238, 238, 238)","textColor":"rgb(150, 151, 153)","hotKeywords":[],"style":{"bgType":"color","bgColor":"#fff","marginBottom":8,"paddingTop":8,"paddingRight":8,"paddingBottom":8,"paddingLeft":8}}},{"id":"NoticeBar","property":{"iconUrl":"http://mall.yudao.iocoder.cn/static/images/xinjian.png","contents":[{"text":"下单请填写床号，工作人员会送到床边","url":""}],"backgroundColor":"#fff","textColor":"#333","style":{"bgType":"color","bgColor":"#fff","marginBottom":8}}},{"id":"ProductCard","property":{"layoutType":"twoCol","fields":{"name":{"show":true,"color":"#000"},"introduction":{"show":true,"color":"#999"},"price":{"show":true,"color":"#ff3000"},"marketPrice":{"show":false,"color":"#c4c4c4"},"salesCount":{"show":true,"color":"#c4c4c4"},"stock":{"show":false,"color":"#c4c4c4"}},"badge":{"show":false,"imgUrl":""},"btnBuy":{"type":"text","text":"购买","bgBeginColor":"#1677ff","bgEndColor":"#4096ff","imgUrl":""},"borderRadiusTop":6,"borderRadiusBottom":6,"space":8,"spuIds":[],"style":{"bgType":"color","bgColor":"","marginLeft":8,"marginRight":8,"marginBottom":8}}}]}', '1', '1', b'0', 1),
       (2, 1, '我的', '', '[]', '{"page":{"description":"","backgroundColor":"#f5f5f5","backgroundImage":""},"navigationBar":{"bgType":"color","bgColor":"#1677ff","bgImg":"","styleType":"normal","showType":"always","alwaysShow":true,"mpCells":[{"type":"text","textColor":"#ffffff","text":"住院用品商城","width":6,"height":1}],"otherCells":[{"type":"text","textColor":"#ffffff","text":"住院用品商城","width":6,"height":1}]},"components":[{"id":"UserCard","property":{"style":{"bgType":"color","bgColor":"","marginBottom":8}}},{"id":"UserOrder","property":{"style":{"bgType":"color","bgColor":"","marginLeft":8,"marginRight":8,"marginBottom":8}}}]}', '1', '1', b'0', 1);
