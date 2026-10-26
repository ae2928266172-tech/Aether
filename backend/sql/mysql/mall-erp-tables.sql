SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `erp_account`;
CREATE TABLE `erp_account` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '账户名称',
  `no` varchar(255) DEFAULT NULL COMMENT '账户编码',
  `remark` text COMMENT '备注',
  `status` int DEFAULT NULL COMMENT '开启状态',
  `sort` int DEFAULT 0 COMMENT '排序',
  `default_status` bit(1) DEFAULT NULL COMMENT '是否默认',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_customer`;
CREATE TABLE `erp_customer` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '客户名称',
  `contact` varchar(255) DEFAULT NULL COMMENT '联系人',
  `mobile` varchar(255) DEFAULT NULL COMMENT '手机号码',
  `telephone` varchar(255) DEFAULT NULL COMMENT '联系电话',
  `email` varchar(255) DEFAULT NULL COMMENT '电子邮箱',
  `fax` varchar(255) DEFAULT NULL COMMENT '传真',
  `remark` text COMMENT '备注',
  `status` int DEFAULT NULL COMMENT '开启状态',
  `sort` int DEFAULT 0 COMMENT '排序',
  `tax_no` varchar(255) DEFAULT NULL COMMENT '纳税人识别号',
  `tax_percent` decimal(24,6) DEFAULT NULL COMMENT '税率',
  `bank_name` varchar(255) DEFAULT NULL COMMENT '开户行',
  `bank_account` varchar(255) DEFAULT NULL COMMENT '开户账号',
  `bank_address` varchar(1024) DEFAULT NULL COMMENT '开户地址',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_finance_payment`;
CREATE TABLE `erp_finance_payment` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '付款单号',
  `status` int DEFAULT NULL COMMENT '付款状态',
  `payment_time` datetime DEFAULT NULL COMMENT '付款时间',
  `finance_user_id` bigint DEFAULT NULL COMMENT '财务人员编号',
  `supplier_id` bigint DEFAULT NULL COMMENT '供应商编号',
  `account_id` bigint DEFAULT NULL COMMENT '付款账户编号',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '合计价格，单位：元',
  `discount_price` decimal(24,6) DEFAULT 0 COMMENT '优惠金额，单位：元',
  `payment_price` decimal(24,6) DEFAULT 0 COMMENT '实付金额，单位：分',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_finance_payment_item`;
CREATE TABLE `erp_finance_payment_item` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `payment_id` bigint DEFAULT NULL COMMENT '付款单编号',
  `biz_type` int DEFAULT NULL COMMENT '业务类型',
  `biz_id` bigint DEFAULT NULL COMMENT '业务编号',
  `biz_no` varchar(255) DEFAULT NULL COMMENT '业务单号',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '应付金额，单位：分',
  `paid_price` decimal(24,6) DEFAULT 0 COMMENT '已付金额，单位：分',
  `payment_price` decimal(24,6) DEFAULT 0 COMMENT '本次付款，单位：分',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_finance_receipt`;
CREATE TABLE `erp_finance_receipt` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '收款单号',
  `status` int DEFAULT NULL COMMENT '收款状态',
  `receipt_time` datetime DEFAULT NULL COMMENT '收款时间',
  `finance_user_id` bigint DEFAULT NULL COMMENT '财务人员编号',
  `customer_id` bigint DEFAULT NULL COMMENT '客户编号',
  `account_id` bigint DEFAULT NULL COMMENT '收款账户编号',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '合计价格，单位：元',
  `discount_price` decimal(24,6) DEFAULT 0 COMMENT '优惠金额，单位：元',
  `receipt_price` decimal(24,6) DEFAULT 0 COMMENT '实付金额，单位：分',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_finance_receipt_item`;
CREATE TABLE `erp_finance_receipt_item` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `receipt_id` bigint DEFAULT NULL COMMENT '收款单编号',
  `biz_type` int DEFAULT NULL COMMENT '业务类型',
  `biz_id` bigint DEFAULT NULL COMMENT '业务编号',
  `biz_no` varchar(255) DEFAULT NULL COMMENT '业务单号',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '应收金额，单位：分',
  `receipted_price` decimal(24,6) DEFAULT 0 COMMENT '已收金额，单位：分',
  `receipt_price` decimal(24,6) DEFAULT 0 COMMENT '本次收款，单位：分',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_product`;
CREATE TABLE `erp_product` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '产品名称',
  `bar_code` varchar(255) DEFAULT NULL COMMENT '产品条码',
  `category_id` bigint DEFAULT NULL COMMENT '产品分类编号',
  `unit_id` bigint DEFAULT NULL COMMENT '单位编号',
  `status` int DEFAULT NULL COMMENT '产品状态',
  `standard` varchar(255) DEFAULT NULL COMMENT '产品规格',
  `remark` text COMMENT '产品备注',
  `expiry_day` int DEFAULT NULL COMMENT '保质期天数',
  `weight` decimal(24,6) DEFAULT NULL COMMENT '基础重量（kg）',
  `purchase_price` decimal(24,6) DEFAULT 0 COMMENT '采购价格，单位：元',
  `sale_price` decimal(24,6) DEFAULT 0 COMMENT '销售价格，单位：元',
  `min_price` decimal(24,6) DEFAULT 0 COMMENT '最低价格，单位：元',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_product_category`;
CREATE TABLE `erp_product_category` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `parent_id` bigint DEFAULT NULL COMMENT '父分类编号',
  `name` varchar(255) DEFAULT NULL COMMENT '分类名称',
  `code` varchar(255) DEFAULT NULL COMMENT '分类编码',
  `sort` int DEFAULT 0 COMMENT '分类排序',
  `status` int DEFAULT NULL COMMENT '开启状态',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_product_unit`;
CREATE TABLE `erp_product_unit` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '单位名字',
  `status` int DEFAULT NULL COMMENT '单位状态',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_purchase_in`;
CREATE TABLE `erp_purchase_in` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '采购入库单号',
  `status` int DEFAULT NULL COMMENT '入库状态',
  `supplier_id` bigint DEFAULT NULL COMMENT '供应商编号',
  `account_id` bigint DEFAULT NULL COMMENT '结算账户编号',
  `in_time` datetime DEFAULT NULL COMMENT '入库时间',
  `order_id` bigint DEFAULT NULL COMMENT '采购订单编号',
  `order_no` varchar(255) DEFAULT NULL COMMENT '采购订单号',
  `total_count` decimal(24,6) DEFAULT 0 COMMENT '合计数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '最终合计价格，单位：元',
  `payment_price` decimal(24,6) DEFAULT 0 COMMENT '已支付金额，单位：元',
  `total_product_price` decimal(24,6) DEFAULT 0 COMMENT '合计产品价格，单位：元',
  `total_tax_price` decimal(24,6) DEFAULT 0 COMMENT '合计税额，单位：元',
  `discount_percent` decimal(24,6) DEFAULT NULL COMMENT '优惠率，百分比',
  `discount_price` decimal(24,6) DEFAULT 0 COMMENT '优惠金额，单位：元',
  `other_price` decimal(24,6) DEFAULT 0 COMMENT '其它金额，单位：元',
  `file_url` varchar(1024) DEFAULT NULL COMMENT '附件地址',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_purchase_in_items`;
CREATE TABLE `erp_purchase_in_items` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `in_id` bigint DEFAULT NULL COMMENT '采购入库编号',
  `order_item_id` bigint DEFAULT NULL COMMENT '采购订单项编号',
  `warehouse_id` bigint DEFAULT NULL COMMENT '仓库编号',
  `product_id` bigint DEFAULT NULL COMMENT '产品编号',
  `product_unit_id` bigint DEFAULT NULL COMMENT '产品单位单位',
  `product_price` decimal(24,6) DEFAULT 0 COMMENT '产品单位单价，单位：元',
  `count` decimal(24,6) DEFAULT 0 COMMENT '数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '总价，单位：元',
  `tax_percent` decimal(24,6) DEFAULT NULL COMMENT '税率，百分比',
  `tax_price` decimal(24,6) DEFAULT 0 COMMENT '税额，单位：元',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_purchase_order`;
CREATE TABLE `erp_purchase_order` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '采购订单号',
  `status` int DEFAULT NULL COMMENT '采购状态',
  `supplier_id` bigint DEFAULT NULL COMMENT '供应商编号',
  `account_id` bigint DEFAULT NULL COMMENT '结算账户编号',
  `order_time` datetime DEFAULT NULL COMMENT '下单时间',
  `total_count` decimal(24,6) DEFAULT 0 COMMENT '合计数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '最终合计价格，单位：元',
  `total_product_price` decimal(24,6) DEFAULT 0 COMMENT '合计产品价格，单位：元',
  `total_tax_price` decimal(24,6) DEFAULT 0 COMMENT '合计税额，单位：元',
  `discount_percent` decimal(24,6) DEFAULT NULL COMMENT '优惠率，百分比',
  `discount_price` decimal(24,6) DEFAULT 0 COMMENT '优惠金额，单位：元',
  `deposit_price` decimal(24,6) DEFAULT 0 COMMENT '定金金额，单位：元',
  `file_url` varchar(1024) DEFAULT NULL COMMENT '附件地址',
  `remark` text COMMENT '备注',
  `in_count` decimal(24,6) DEFAULT 0 COMMENT '采购入库数量',
  `return_count` decimal(24,6) DEFAULT 0 COMMENT '采购退货数量',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_purchase_order_items`;
CREATE TABLE `erp_purchase_order_items` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `order_id` bigint DEFAULT NULL COMMENT '采购订单编号',
  `product_id` bigint DEFAULT NULL COMMENT '产品编号',
  `product_unit_id` bigint DEFAULT NULL COMMENT '产品单位单位',
  `product_price` decimal(24,6) DEFAULT 0 COMMENT '产品单位单价，单位：元',
  `count` decimal(24,6) DEFAULT 0 COMMENT '数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '总价，单位：元',
  `tax_percent` decimal(24,6) DEFAULT NULL COMMENT '税率，百分比',
  `tax_price` decimal(24,6) DEFAULT 0 COMMENT '税额，单位：元',
  `remark` text COMMENT '备注',
  `in_count` decimal(24,6) DEFAULT 0 COMMENT '采购入库数量',
  `return_count` decimal(24,6) DEFAULT 0 COMMENT '采购退货数量',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_purchase_return`;
CREATE TABLE `erp_purchase_return` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '采购退货单号',
  `status` int DEFAULT NULL COMMENT '退货状态',
  `supplier_id` bigint DEFAULT NULL COMMENT '供应商编号',
  `account_id` bigint DEFAULT NULL COMMENT '结算账户编号',
  `return_time` datetime DEFAULT NULL COMMENT '退货时间',
  `order_id` bigint DEFAULT NULL COMMENT '采购订单编号',
  `order_no` varchar(255) DEFAULT NULL COMMENT '采购订单号',
  `total_count` decimal(24,6) DEFAULT 0 COMMENT '合计数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '最终合计价格，单位：元',
  `refund_price` decimal(24,6) DEFAULT 0 COMMENT '已退款金额，单位：元',
  `total_product_price` decimal(24,6) DEFAULT 0 COMMENT '合计产品价格，单位：元',
  `total_tax_price` decimal(24,6) DEFAULT 0 COMMENT '合计税额，单位：元',
  `discount_percent` decimal(24,6) DEFAULT NULL COMMENT '优惠率，百分比',
  `discount_price` decimal(24,6) DEFAULT 0 COMMENT '优惠金额，单位：元',
  `other_price` decimal(24,6) DEFAULT 0 COMMENT '其它金额，单位：元',
  `file_url` varchar(1024) DEFAULT NULL COMMENT '附件地址',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_purchase_return_items`;
CREATE TABLE `erp_purchase_return_items` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `return_id` bigint DEFAULT NULL COMMENT '采购退货编号',
  `order_item_id` bigint DEFAULT NULL COMMENT '采购订单项编号',
  `warehouse_id` bigint DEFAULT NULL COMMENT '仓库编号',
  `product_id` bigint DEFAULT NULL COMMENT '产品编号',
  `product_unit_id` bigint DEFAULT NULL COMMENT '产品单位单位',
  `product_price` decimal(24,6) DEFAULT 0 COMMENT '产品单位单价，单位：元',
  `count` decimal(24,6) DEFAULT 0 COMMENT '数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '总价，单位：元',
  `tax_percent` decimal(24,6) DEFAULT NULL COMMENT '税率，百分比',
  `tax_price` decimal(24,6) DEFAULT 0 COMMENT '税额，单位：元',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_sale_order`;
CREATE TABLE `erp_sale_order` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '销售订单号',
  `status` int DEFAULT NULL COMMENT '销售状态',
  `customer_id` bigint DEFAULT NULL COMMENT '客户编号',
  `account_id` bigint DEFAULT NULL COMMENT '结算账户编号',
  `sale_user_id` bigint DEFAULT NULL COMMENT '销售员编号',
  `order_time` datetime DEFAULT NULL COMMENT '下单时间',
  `total_count` decimal(24,6) DEFAULT 0 COMMENT '合计数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '最终合计价格，单位：元',
  `total_product_price` decimal(24,6) DEFAULT 0 COMMENT '合计产品价格，单位：元',
  `total_tax_price` decimal(24,6) DEFAULT 0 COMMENT '合计税额，单位：元',
  `discount_percent` decimal(24,6) DEFAULT NULL COMMENT '优惠率，百分比',
  `discount_price` decimal(24,6) DEFAULT 0 COMMENT '优惠金额，单位：元',
  `deposit_price` decimal(24,6) DEFAULT 0 COMMENT '定金金额，单位：元',
  `file_url` varchar(1024) DEFAULT NULL COMMENT '附件地址',
  `remark` text COMMENT '备注',
  `out_count` decimal(24,6) DEFAULT 0 COMMENT '销售出库数量',
  `return_count` decimal(24,6) DEFAULT 0 COMMENT '销售退货数量',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_sale_order_items`;
CREATE TABLE `erp_sale_order_items` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `order_id` bigint DEFAULT NULL COMMENT '销售订单编号',
  `product_id` bigint DEFAULT NULL COMMENT '产品编号',
  `product_unit_id` bigint DEFAULT NULL COMMENT '产品单位单位',
  `product_price` decimal(24,6) DEFAULT 0 COMMENT '产品单位单价，单位：元',
  `count` decimal(24,6) DEFAULT 0 COMMENT '数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '总价，单位：元',
  `tax_percent` decimal(24,6) DEFAULT NULL COMMENT '税率，百分比',
  `tax_price` decimal(24,6) DEFAULT 0 COMMENT '税额，单位：元',
  `remark` text COMMENT '备注',
  `out_count` decimal(24,6) DEFAULT 0 COMMENT '销售出库数量',
  `return_count` decimal(24,6) DEFAULT 0 COMMENT '销售退货数量',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_sale_out`;
CREATE TABLE `erp_sale_out` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '销售出库单号',
  `status` int DEFAULT NULL COMMENT '出库状态',
  `customer_id` bigint DEFAULT NULL COMMENT '客户编号',
  `account_id` bigint DEFAULT NULL COMMENT '结算账户编号',
  `sale_user_id` bigint DEFAULT NULL COMMENT '销售员编号',
  `out_time` datetime DEFAULT NULL COMMENT '出库时间',
  `order_id` bigint DEFAULT NULL COMMENT '销售订单编号',
  `order_no` varchar(255) DEFAULT NULL COMMENT '销售订单号',
  `total_count` decimal(24,6) DEFAULT 0 COMMENT '合计数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '最终合计价格，单位：元',
  `receipt_price` decimal(24,6) DEFAULT 0 COMMENT '已收款金额，单位：元',
  `total_product_price` decimal(24,6) DEFAULT 0 COMMENT '合计产品价格，单位：元',
  `total_tax_price` decimal(24,6) DEFAULT 0 COMMENT '合计税额，单位：元',
  `discount_percent` decimal(24,6) DEFAULT NULL COMMENT '优惠率，百分比',
  `discount_price` decimal(24,6) DEFAULT 0 COMMENT '优惠金额，单位：元',
  `other_price` decimal(24,6) DEFAULT 0 COMMENT '其它金额，单位：元',
  `file_url` varchar(1024) DEFAULT NULL COMMENT '附件地址',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_sale_out_items`;
CREATE TABLE `erp_sale_out_items` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `out_id` bigint DEFAULT NULL COMMENT '销售出库编号',
  `order_item_id` bigint DEFAULT NULL COMMENT '销售订单项编号',
  `warehouse_id` bigint DEFAULT NULL COMMENT '仓库编号',
  `product_id` bigint DEFAULT NULL COMMENT '产品编号',
  `product_unit_id` bigint DEFAULT NULL COMMENT '产品单位单位',
  `product_price` decimal(24,6) DEFAULT 0 COMMENT '产品单位单价，单位：元',
  `count` decimal(24,6) DEFAULT 0 COMMENT '数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '总价，单位：元',
  `tax_percent` decimal(24,6) DEFAULT NULL COMMENT '税率，百分比',
  `tax_price` decimal(24,6) DEFAULT 0 COMMENT '税额，单位：元',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_sale_return`;
CREATE TABLE `erp_sale_return` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '销售退货单号',
  `status` int DEFAULT NULL COMMENT '退货状态',
  `customer_id` bigint DEFAULT NULL COMMENT '客户编号',
  `account_id` bigint DEFAULT NULL COMMENT '结算账户编号',
  `sale_user_id` bigint DEFAULT NULL COMMENT '销售员编号',
  `return_time` datetime DEFAULT NULL COMMENT '退货时间',
  `order_id` bigint DEFAULT NULL COMMENT '销售订单编号',
  `order_no` varchar(255) DEFAULT NULL COMMENT '销售订单号',
  `total_count` decimal(24,6) DEFAULT 0 COMMENT '合计数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '最终合计价格，单位：元',
  `refund_price` decimal(24,6) DEFAULT 0 COMMENT '已退款金额，单位：元',
  `total_product_price` decimal(24,6) DEFAULT 0 COMMENT '合计产品价格，单位：元',
  `total_tax_price` decimal(24,6) DEFAULT 0 COMMENT '合计税额，单位：元',
  `discount_percent` decimal(24,6) DEFAULT NULL COMMENT '优惠率，百分比',
  `discount_price` decimal(24,6) DEFAULT 0 COMMENT '优惠金额，单位：元',
  `other_price` decimal(24,6) DEFAULT 0 COMMENT '其它金额，单位：元',
  `file_url` varchar(1024) DEFAULT NULL COMMENT '附件地址',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_sale_return_items`;
CREATE TABLE `erp_sale_return_items` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `return_id` bigint DEFAULT NULL COMMENT '销售退货编号',
  `order_item_id` bigint DEFAULT NULL COMMENT '销售订单项编号',
  `warehouse_id` bigint DEFAULT NULL COMMENT '仓库编号',
  `product_id` bigint DEFAULT NULL COMMENT '产品编号',
  `product_unit_id` bigint DEFAULT NULL COMMENT '产品单位单位',
  `product_price` decimal(24,6) DEFAULT 0 COMMENT '产品单位单价，单位：元',
  `count` decimal(24,6) DEFAULT 0 COMMENT '数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '总价，单位：元',
  `tax_percent` decimal(24,6) DEFAULT NULL COMMENT '税率，百分比',
  `tax_price` decimal(24,6) DEFAULT 0 COMMENT '税额，单位：元',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_stock`;
CREATE TABLE `erp_stock` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `product_id` bigint DEFAULT NULL COMMENT '产品编号',
  `warehouse_id` bigint DEFAULT NULL COMMENT '仓库编号',
  `count` decimal(24,6) DEFAULT 0 COMMENT '库存数量',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_stock_check`;
CREATE TABLE `erp_stock_check` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '盘点单号',
  `check_time` datetime DEFAULT NULL COMMENT '盘点时间',
  `total_count` decimal(24,6) DEFAULT 0 COMMENT '合计数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '合计金额，单位：元',
  `status` int DEFAULT NULL COMMENT '状态',
  `remark` text COMMENT '备注',
  `file_url` varchar(1024) DEFAULT NULL COMMENT '附件 URL',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_stock_check_item`;
CREATE TABLE `erp_stock_check_item` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `check_id` bigint DEFAULT NULL COMMENT '盘点编号',
  `warehouse_id` bigint DEFAULT NULL COMMENT '仓库编号',
  `product_id` bigint DEFAULT NULL COMMENT '产品编号',
  `product_unit_id` bigint DEFAULT NULL COMMENT '产品单位编号',
  `product_price` decimal(24,6) DEFAULT 0 COMMENT '产品单价',
  `stock_count` decimal(24,6) DEFAULT 0 COMMENT '账面数量（当前库存）',
  `actual_count` decimal(24,6) DEFAULT 0 COMMENT '实际数量（实际库存）',
  `count` decimal(24,6) DEFAULT 0 COMMENT '盈亏数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '合计金额，单位：元',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_stock_in`;
CREATE TABLE `erp_stock_in` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '入库单号',
  `supplier_id` bigint DEFAULT NULL COMMENT '供应商编号',
  `in_time` datetime DEFAULT NULL COMMENT '入库时间',
  `total_count` decimal(24,6) DEFAULT 0 COMMENT '合计数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '合计金额，单位：元',
  `status` int DEFAULT NULL COMMENT '状态',
  `remark` text COMMENT '备注',
  `file_url` varchar(1024) DEFAULT NULL COMMENT '附件 URL',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_stock_in_item`;
CREATE TABLE `erp_stock_in_item` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `in_id` bigint DEFAULT NULL COMMENT '入库编号',
  `warehouse_id` bigint DEFAULT NULL COMMENT '仓库编号',
  `product_id` bigint DEFAULT NULL COMMENT '产品编号',
  `product_unit_id` bigint DEFAULT NULL COMMENT '产品单位编号',
  `product_price` decimal(24,6) DEFAULT 0 COMMENT '产品单价',
  `count` decimal(24,6) DEFAULT 0 COMMENT '产品数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '合计金额，单位：元',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_stock_move`;
CREATE TABLE `erp_stock_move` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '调拨单号',
  `move_time` datetime DEFAULT NULL COMMENT '调拨时间',
  `total_count` decimal(24,6) DEFAULT 0 COMMENT '合计数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '合计金额，单位：元',
  `status` int DEFAULT NULL COMMENT '状态',
  `remark` text COMMENT '备注',
  `file_url` varchar(1024) DEFAULT NULL COMMENT '附件 URL',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_stock_move_item`;
CREATE TABLE `erp_stock_move_item` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `move_id` bigint DEFAULT NULL COMMENT '调拨编号',
  `from_warehouse_id` bigint DEFAULT NULL COMMENT '调出仓库编号',
  `to_warehouse_id` bigint DEFAULT NULL COMMENT '调入仓库编号',
  `product_id` bigint DEFAULT NULL COMMENT '产品编号',
  `product_unit_id` bigint DEFAULT NULL COMMENT '产品单位编号',
  `product_price` decimal(24,6) DEFAULT 0 COMMENT '产品单价',
  `count` decimal(24,6) DEFAULT 0 COMMENT '产品数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '合计金额，单位：元',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_stock_out`;
CREATE TABLE `erp_stock_out` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '出库单号',
  `customer_id` bigint DEFAULT NULL COMMENT '客户编号',
  `out_time` datetime DEFAULT NULL COMMENT '出库时间',
  `total_count` decimal(24,6) DEFAULT 0 COMMENT '合计数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '合计金额，单位：元',
  `status` int DEFAULT NULL COMMENT '状态',
  `remark` text COMMENT '备注',
  `file_url` varchar(1024) DEFAULT NULL COMMENT '附件 URL',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_stock_out_item`;
CREATE TABLE `erp_stock_out_item` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `out_id` bigint DEFAULT NULL COMMENT '出库编号',
  `warehouse_id` bigint DEFAULT NULL COMMENT '仓库编号',
  `product_id` bigint DEFAULT NULL COMMENT '产品编号',
  `product_unit_id` bigint DEFAULT NULL COMMENT '产品单位编号',
  `product_price` decimal(24,6) DEFAULT 0 COMMENT '产品单价',
  `count` decimal(24,6) DEFAULT 0 COMMENT '产品数量',
  `total_price` decimal(24,6) DEFAULT 0 COMMENT '合计金额，单位：元',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_stock_record`;
CREATE TABLE `erp_stock_record` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `product_id` bigint DEFAULT NULL COMMENT '产品编号',
  `warehouse_id` bigint DEFAULT NULL COMMENT '仓库编号',
  `count` decimal(24,6) DEFAULT 0 COMMENT '出入库数量',
  `total_count` decimal(24,6) DEFAULT 0 COMMENT '总库存量',
  `biz_type` int DEFAULT NULL COMMENT '业务类型',
  `biz_id` bigint DEFAULT NULL COMMENT '业务编号',
  `biz_item_id` bigint DEFAULT NULL COMMENT '业务项编号',
  `biz_no` varchar(255) DEFAULT NULL COMMENT '业务单号',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_supplier`;
CREATE TABLE `erp_supplier` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '供应商名称',
  `contact` varchar(255) DEFAULT NULL COMMENT '联系人',
  `mobile` varchar(255) DEFAULT NULL COMMENT '手机号码',
  `telephone` varchar(255) DEFAULT NULL COMMENT '联系电话',
  `email` varchar(255) DEFAULT NULL COMMENT '电子邮箱',
  `fax` varchar(255) DEFAULT NULL COMMENT '传真',
  `remark` text COMMENT '备注',
  `status` int DEFAULT NULL COMMENT '开启状态',
  `sort` int DEFAULT 0 COMMENT '排序',
  `tax_no` varchar(255) DEFAULT NULL COMMENT '纳税人识别号',
  `tax_percent` decimal(24,6) DEFAULT NULL COMMENT '税率',
  `bank_name` varchar(255) DEFAULT NULL COMMENT '开户行',
  `bank_account` varchar(255) DEFAULT NULL COMMENT '开户账号',
  `bank_address` varchar(1024) DEFAULT NULL COMMENT '开户地址',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `erp_warehouse`;
CREATE TABLE `erp_warehouse` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '仓库名称',
  `address` varchar(1024) DEFAULT NULL COMMENT '仓库地址',
  `sort` bigint DEFAULT 0 COMMENT '排序',
  `remark` text COMMENT '备注',
  `principal` varchar(255) DEFAULT NULL COMMENT '负责人',
  `warehouse_price` decimal(24,6) DEFAULT 0 COMMENT '仓储费，单位：元',
  `truckage_price` decimal(24,6) DEFAULT 0 COMMENT '搬运费，单位：元',
  `status` int DEFAULT NULL COMMENT '开启状态',
  `default_status` bit(1) DEFAULT NULL COMMENT '是否默认',
  `gift_status` bit(1) DEFAULT NULL COMMENT '是否赠品库',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `member_address`;
CREATE TABLE `member_address` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `name` varchar(255) DEFAULT NULL COMMENT '收件人名称',
  `mobile` varchar(255) DEFAULT NULL COMMENT '手机号',
  `area_id` bigint DEFAULT NULL COMMENT '地区编号',
  `detail_address` varchar(1024) DEFAULT NULL COMMENT '收件详细地址',
  `default_status` bit(1) DEFAULT NULL COMMENT '是否默认',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `member_config`;
CREATE TABLE `member_config` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `point_trade_deduct_enable` bit(1) DEFAULT NULL COMMENT '积分抵扣开关',
  `point_trade_deduct_unit_price` int DEFAULT 0 COMMENT '积分抵扣，单位：分',
  `point_trade_deduct_max_price` int DEFAULT 0 COMMENT '积分抵扣最大值',
  `point_trade_give_point` int DEFAULT 0 COMMENT '1 元赠送多少分',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `member_experience_record`;
CREATE TABLE `member_experience_record` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `biz_type` int DEFAULT NULL COMMENT '业务类型',
  `biz_id` varchar(255) DEFAULT NULL COMMENT '业务编号',
  `title` varchar(255) DEFAULT NULL COMMENT '标题',
  `description` text COMMENT '描述',
  `experience` int DEFAULT NULL COMMENT '经验',
  `total_experience` int DEFAULT NULL COMMENT '变更后的经验',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `member_group`;
CREATE TABLE `member_group` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '名称',
  `remark` text COMMENT '备注',
  `status` int DEFAULT NULL COMMENT '状态',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `member_level`;
CREATE TABLE `member_level` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '等级名称',
  `level` int DEFAULT NULL COMMENT '等级',
  `experience` int DEFAULT NULL COMMENT '升级经验',
  `discount_percent` int DEFAULT NULL COMMENT '享受折扣',
  `icon` varchar(255) DEFAULT NULL COMMENT '等级图标',
  `background_url` varchar(1024) DEFAULT NULL COMMENT '等级背景图',
  `status` int DEFAULT NULL COMMENT '状态',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `member_level_record`;
CREATE TABLE `member_level_record` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `level_id` bigint DEFAULT NULL COMMENT '等级编号',
  `level` int DEFAULT NULL COMMENT '会员等级',
  `discount_percent` int DEFAULT NULL COMMENT '享受折扣',
  `experience` int DEFAULT NULL COMMENT '升级经验',
  `user_experience` int DEFAULT NULL COMMENT '会员此时的经验',
  `remark` text COMMENT '备注',
  `description` text COMMENT '描述',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `member_point_record`;
CREATE TABLE `member_point_record` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `biz_id` varchar(255) DEFAULT NULL COMMENT '业务编码',
  `biz_type` int DEFAULT NULL COMMENT '业务类型',
  `title` varchar(255) DEFAULT NULL COMMENT '积分标题',
  `description` text COMMENT '积分描述',
  `point` int DEFAULT 0 COMMENT '变动积分',
  `total_point` int DEFAULT 0 COMMENT '变动后的积分',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `member_sign_in_config`;
CREATE TABLE `member_sign_in_config` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `day` int DEFAULT NULL COMMENT '签到第 x 天',
  `point` int DEFAULT 0 COMMENT '奖励积分',
  `experience` int DEFAULT NULL COMMENT '奖励经验',
  `status` int DEFAULT NULL COMMENT '状态',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `member_sign_in_record`;
CREATE TABLE `member_sign_in_record` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `user_id` bigint DEFAULT NULL COMMENT '签到用户',
  `day` int DEFAULT NULL COMMENT '第几天签到',
  `point` int DEFAULT 0 COMMENT '签到的积分',
  `experience` int DEFAULT NULL COMMENT '签到的经验',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `member_tag`;
CREATE TABLE `member_tag` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '标签名称',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `member_user`;
CREATE TABLE `member_user` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `mobile` varchar(255) DEFAULT NULL COMMENT '手机',
  `email` varchar(255) DEFAULT NULL COMMENT '邮箱',
  `password` varchar(255) DEFAULT NULL COMMENT '加密后的密码',
  `status` int DEFAULT NULL COMMENT '帐号状态',
  `register_ip` varchar(255) DEFAULT NULL COMMENT '注册 IP',
  `register_terminal` int DEFAULT NULL COMMENT '注册终端',
  `login_ip` varchar(255) DEFAULT NULL COMMENT '最后登录IP',
  `login_date` datetime DEFAULT NULL COMMENT '最后登录时间',
  `nickname` varchar(255) DEFAULT NULL COMMENT '用户昵称',
  `avatar` varchar(1024) DEFAULT NULL COMMENT '用户头像',
  `name` varchar(255) DEFAULT NULL COMMENT '真实名字',
  `sex` int DEFAULT NULL COMMENT '性别',
  `birthday` datetime DEFAULT NULL COMMENT '出生日期',
  `area_id` int DEFAULT NULL COMMENT '所在地',
  `mark` varchar(255) DEFAULT NULL COMMENT '用户备注',
  `point` int DEFAULT 0 COMMENT '积分',
  `tag_ids` text COMMENT '会员标签列表，以逗号分隔',
  `level_id` bigint DEFAULT NULL COMMENT '会员级别编号',
  `experience` int DEFAULT NULL COMMENT '会员经验',
  `group_id` bigint DEFAULT NULL COMMENT '用户分组编号',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `pay_app`;
CREATE TABLE `pay_app` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `app_key` varchar(255) DEFAULT NULL COMMENT '应用标识',
  `name` varchar(255) DEFAULT NULL COMMENT '应用名',
  `status` int DEFAULT NULL COMMENT '状态',
  `remark` text COMMENT '备注',
  `order_notify_url` varchar(1024) DEFAULT NULL COMMENT '支付结果的回调地址',
  `refund_notify_url` varchar(1024) DEFAULT NULL COMMENT '退款结果的回调地址',
  `transfer_notify_url` varchar(1024) DEFAULT NULL COMMENT '转账结果的回调地址',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `pay_channel`;
CREATE TABLE `pay_channel` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `code` varchar(255) DEFAULT NULL COMMENT '渠道编码',
  `status` int DEFAULT NULL COMMENT '状态',
  `fee_rate` double DEFAULT NULL COMMENT '渠道费率，单位：百分比',
  `remark` text COMMENT '备注',
  `app_id` bigint DEFAULT NULL COMMENT '应用编号',
  `config` text COMMENT '支付渠道配置',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `pay_demo_order`;
CREATE TABLE `pay_demo_order` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `spu_id` bigint DEFAULT NULL COMMENT '商品编号',
  `spu_name` varchar(255) DEFAULT NULL COMMENT '商品名称',
  `price` int DEFAULT 0 COMMENT '价格，单位：分',
  `pay_status` bit(1) DEFAULT NULL COMMENT '是否支付',
  `pay_order_id` bigint DEFAULT NULL COMMENT '支付订单编号',
  `pay_time` datetime DEFAULT NULL COMMENT '付款时间',
  `pay_channel_code` varchar(255) DEFAULT NULL COMMENT '支付渠道',
  `pay_refund_id` bigint DEFAULT NULL COMMENT '支付退款单号',
  `refund_price` int DEFAULT 0 COMMENT '退款金额，单位：分',
  `refund_time` datetime DEFAULT NULL COMMENT '退款完成时间',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `pay_demo_withdraw`;
CREATE TABLE `pay_demo_withdraw` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `subject` varchar(255) DEFAULT NULL COMMENT '提现标题',
  `price` int DEFAULT 0 COMMENT '提现金额，单位：分',
  `user_account` varchar(255) DEFAULT NULL COMMENT '收款人账号',
  `user_name` varchar(255) DEFAULT NULL COMMENT '收款人姓名',
  `type` int DEFAULT NULL COMMENT '提现方式',
  `status` int DEFAULT NULL COMMENT '提现状态',
  `pay_transfer_id` bigint DEFAULT NULL COMMENT '转账单编号',
  `transfer_channel_code` varchar(255) DEFAULT NULL COMMENT '转账渠道',
  `transfer_time` datetime DEFAULT NULL COMMENT '转账成功时间',
  `transfer_error_msg` varchar(255) DEFAULT NULL COMMENT '转账错误提示',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `pay_notify_log`;
CREATE TABLE `pay_notify_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `task_id` bigint DEFAULT NULL COMMENT '通知任务编号',
  `notify_times` int DEFAULT 0 COMMENT '第几次被通知',
  `response` text COMMENT 'HTTP 响应结果',
  `status` int DEFAULT NULL COMMENT '支付通知状态',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `pay_notify_task`;
CREATE TABLE `pay_notify_task` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `app_id` bigint DEFAULT NULL COMMENT '应用编号',
  `type` int DEFAULT NULL COMMENT '通知类型',
  `data_id` bigint DEFAULT NULL COMMENT '数据编号，根据不同 type 进行关联：',
  `merchant_order_id` varchar(255) DEFAULT NULL COMMENT '商户订单编号',
  `merchant_refund_id` varchar(255) DEFAULT NULL COMMENT '商户退款编号',
  `merchant_transfer_id` varchar(255) DEFAULT NULL COMMENT '商户转账编号',
  `status` int DEFAULT NULL COMMENT '通知状态',
  `next_notify_time` datetime DEFAULT NULL COMMENT '下一次通知时间',
  `last_execute_time` datetime DEFAULT NULL COMMENT '最后一次执行时间',
  `notify_times` int DEFAULT 0 COMMENT '当前通知次数',
  `max_notify_times` int DEFAULT 0 COMMENT '最大可通知次数',
  `notify_url` varchar(1024) DEFAULT NULL COMMENT '通知地址',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `pay_order`;
CREATE TABLE `pay_order` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `app_id` bigint DEFAULT NULL COMMENT '应用编号',
  `channel_id` bigint DEFAULT NULL COMMENT '渠道编号',
  `channel_code` varchar(255) DEFAULT NULL COMMENT '渠道编码',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `user_type` int DEFAULT NULL COMMENT '用户类型',
  `merchant_order_id` varchar(255) DEFAULT NULL COMMENT '商户订单编号',
  `subject` varchar(255) DEFAULT NULL COMMENT '商品标题',
  `body` varchar(255) DEFAULT NULL COMMENT '商品描述信息',
  `notify_url` varchar(1024) DEFAULT NULL COMMENT '异步通知地址',
  `price` int DEFAULT 0 COMMENT '支付金额，单位：分',
  `channel_fee_rate` double DEFAULT NULL COMMENT '渠道手续费，单位：百分比',
  `channel_fee_price` int DEFAULT 0 COMMENT '渠道手续金额，单位：分',
  `status` int DEFAULT NULL COMMENT '支付状态',
  `user_ip` varchar(255) DEFAULT NULL COMMENT '用户 IP',
  `expire_time` datetime DEFAULT NULL COMMENT '订单失效时间',
  `success_time` datetime DEFAULT NULL COMMENT '订单支付成功时间',
  `extension_id` bigint DEFAULT NULL COMMENT '支付成功的订单拓展单编号',
  `no` varchar(255) DEFAULT NULL COMMENT '支付成功的外部订单号',
  `refund_price` int DEFAULT 0 COMMENT '退款总金额，单位：分',
  `channel_user_id` varchar(255) DEFAULT NULL COMMENT '渠道用户编号',
  `channel_order_no` varchar(255) DEFAULT NULL COMMENT '渠道订单号',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `pay_order_extension`;
CREATE TABLE `pay_order_extension` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '外部订单号，根据规则生成',
  `order_id` bigint DEFAULT NULL COMMENT '订单号',
  `channel_id` bigint DEFAULT NULL COMMENT '渠道编号',
  `channel_code` varchar(255) DEFAULT NULL COMMENT '渠道编码',
  `user_ip` varchar(255) DEFAULT NULL COMMENT '用户 IP',
  `status` int DEFAULT NULL COMMENT '支付状态',
  `channel_extras` text COMMENT '支付渠道的额外参数',
  `channel_error_code` varchar(255) DEFAULT NULL COMMENT '调用渠道的错误码',
  `channel_error_msg` varchar(255) DEFAULT NULL COMMENT '调用渠道报错时，错误信息',
  `channel_notify_data` text COMMENT '支付渠道的同步/异步通知的内容',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `pay_refund`;
CREATE TABLE `pay_refund` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '外部退款号，根据规则生成',
  `app_id` bigint DEFAULT NULL COMMENT '应用编号',
  `channel_id` bigint DEFAULT NULL COMMENT '渠道编号',
  `channel_code` varchar(255) DEFAULT NULL COMMENT '渠道编码',
  `order_id` bigint DEFAULT NULL COMMENT '订单编号',
  `order_no` varchar(255) DEFAULT NULL COMMENT '支付订单编号',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `user_type` int DEFAULT NULL COMMENT '用户类型',
  `merchant_order_id` varchar(255) DEFAULT NULL COMMENT '商户订单编号',
  `merchant_refund_id` varchar(255) DEFAULT NULL COMMENT '商户退款订单号',
  `notify_url` varchar(1024) DEFAULT NULL COMMENT '异步通知地址',
  `status` int DEFAULT NULL COMMENT '退款状态',
  `pay_price` int DEFAULT 0 COMMENT '支付金额，单位：分',
  `refund_price` int DEFAULT 0 COMMENT '退款金额，单位：分',
  `reason` varchar(255) DEFAULT NULL COMMENT '退款原因',
  `user_ip` varchar(255) DEFAULT NULL COMMENT '用户 IP',
  `channel_order_no` varchar(255) DEFAULT NULL COMMENT '渠道订单号',
  `channel_refund_no` varchar(255) DEFAULT NULL COMMENT '渠道退款单号',
  `success_time` datetime DEFAULT NULL COMMENT '退款成功时间',
  `channel_error_code` varchar(255) DEFAULT NULL COMMENT '调用渠道的错误码',
  `channel_error_msg` varchar(255) DEFAULT NULL COMMENT '调用渠道的错误提示',
  `channel_notify_data` text COMMENT '支付渠道的同步/异步通知的内容',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `pay_transfer`;
CREATE TABLE `pay_transfer` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '转账单号',
  `app_id` bigint DEFAULT NULL COMMENT '应用编号',
  `channel_id` bigint DEFAULT NULL COMMENT '转账渠道编号',
  `channel_code` varchar(255) DEFAULT NULL COMMENT '转账渠道编码',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `user_type` int DEFAULT NULL COMMENT '用户类型',
  `merchant_transfer_id` varchar(255) DEFAULT NULL COMMENT '商户转账单编号',
  `subject` varchar(255) DEFAULT NULL COMMENT '转账标题',
  `price` int DEFAULT 0 COMMENT '转账金额，单位：分',
  `user_account` varchar(255) DEFAULT NULL COMMENT '收款人账号',
  `user_name` varchar(255) DEFAULT NULL COMMENT '收款人姓名',
  `status` int DEFAULT NULL COMMENT '转账状态',
  `success_time` datetime DEFAULT NULL COMMENT '订单转账成功时间',
  `notify_url` varchar(1024) DEFAULT NULL COMMENT '异步通知地址',
  `user_ip` varchar(255) DEFAULT NULL COMMENT '用户 IP',
  `channel_extras` text COMMENT '渠道的额外参数',
  `channel_transfer_no` varchar(255) DEFAULT NULL COMMENT '渠道转账单号',
  `channel_error_code` varchar(255) DEFAULT NULL COMMENT '调用渠道的错误码',
  `channel_error_msg` varchar(255) DEFAULT NULL COMMENT '调用渠道的错误提示',
  `channel_notify_data` text COMMENT '渠道的同步/异步通知的内容',
  `channel_package_info` text COMMENT '渠道 package 信息',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `pay_wallet`;
CREATE TABLE `pay_wallet` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `user_id` bigint DEFAULT NULL COMMENT '用户 id',
  `user_type` int DEFAULT NULL COMMENT '用户类型, 预留 多商户转帐可能需要用到',
  `balance` int DEFAULT 0 COMMENT '余额，单位分',
  `freeze_price` int DEFAULT 0 COMMENT '冻结金额，单位分',
  `total_expense` int DEFAULT NULL COMMENT '累计支出，单位分',
  `total_recharge` int DEFAULT NULL COMMENT '累计充值，单位分',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `pay_wallet_recharge`;
CREATE TABLE `pay_wallet_recharge` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `wallet_id` bigint DEFAULT NULL COMMENT '钱包编号',
  `total_price` int DEFAULT 0 COMMENT '用户实际到账余额',
  `pay_price` int DEFAULT 0 COMMENT '实际支付金额',
  `bonus_price` int DEFAULT 0 COMMENT '钱包赠送金额',
  `package_id` bigint DEFAULT NULL COMMENT '充值套餐编号',
  `pay_status` bit(1) DEFAULT NULL COMMENT '是否已支付',
  `pay_order_id` bigint DEFAULT NULL COMMENT '支付订单编号',
  `pay_channel_code` varchar(255) DEFAULT NULL COMMENT '支付成功的支付渠道',
  `pay_time` datetime DEFAULT NULL COMMENT '订单支付时间',
  `pay_refund_id` bigint DEFAULT NULL COMMENT '支付退款单编号',
  `refund_total_price` int DEFAULT 0 COMMENT '退款金额，包含赠送金额',
  `refund_pay_price` int DEFAULT 0 COMMENT '退款支付金额',
  `refund_bonus_price` int DEFAULT 0 COMMENT '退款钱包赠送金额',
  `refund_time` datetime DEFAULT NULL COMMENT '退款时间',
  `refund_status` int DEFAULT NULL COMMENT '退款状态',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `pay_wallet_recharge_package`;
CREATE TABLE `pay_wallet_recharge_package` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '套餐名',
  `pay_price` int DEFAULT 0 COMMENT '支付金额',
  `bonus_price` int DEFAULT 0 COMMENT '赠送金额',
  `status` int DEFAULT NULL COMMENT '状态',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `pay_wallet_transaction`;
CREATE TABLE `pay_wallet_transaction` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '流水号',
  `wallet_id` bigint DEFAULT NULL COMMENT '钱包编号',
  `biz_type` int DEFAULT NULL COMMENT '关联业务分类',
  `biz_id` varchar(255) DEFAULT NULL COMMENT '关联业务编号',
  `title` varchar(255) DEFAULT NULL COMMENT '流水说明',
  `price` int DEFAULT 0 COMMENT '交易金额，单位分',
  `balance` int DEFAULT 0 COMMENT '交易后余额，单位分',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `product_brand`;
CREATE TABLE `product_brand` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '品牌名称',
  `pic_url` varchar(1024) DEFAULT NULL COMMENT '品牌图片',
  `sort` int DEFAULT 0 COMMENT '品牌排序',
  `description` text COMMENT '品牌描述',
  `status` int DEFAULT NULL COMMENT '状态',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `product_browse_history`;
CREATE TABLE `product_browse_history` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `spu_id` bigint DEFAULT NULL COMMENT '商品 SPU 编号',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `user_deleted` bit(1) DEFAULT NULL COMMENT '用户是否删除',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `product_category`;
CREATE TABLE `product_category` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `parent_id` bigint DEFAULT NULL COMMENT '父分类编号',
  `name` varchar(255) DEFAULT NULL COMMENT '分类名称',
  `pic_url` varchar(1024) DEFAULT NULL COMMENT '移动端分类图',
  `sort` int DEFAULT 0 COMMENT '分类排序',
  `status` int DEFAULT NULL COMMENT '开启状态',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `product_comment`;
CREATE TABLE `product_comment` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `user_id` bigint DEFAULT NULL COMMENT '评价人的用户编号',
  `user_nickname` varchar(255) DEFAULT NULL COMMENT '评价人名称',
  `user_avatar` varchar(1024) DEFAULT NULL COMMENT '评价人头像',
  `anonymous` bit(1) DEFAULT NULL COMMENT '是否匿名',
  `order_id` bigint DEFAULT NULL COMMENT '交易订单编号',
  `order_item_id` bigint DEFAULT NULL COMMENT '交易订单项编号',
  `spu_id` bigint DEFAULT NULL COMMENT '商品 SPU 编号',
  `spu_name` varchar(255) DEFAULT NULL COMMENT '商品 SPU 名称',
  `sku_id` bigint DEFAULT NULL COMMENT '商品 SKU 编号',
  `sku_pic_url` varchar(1024) DEFAULT NULL COMMENT '商品 SKU 图片地址',
  `sku_properties` text COMMENT '属性数组，JSON 格式',
  `visible` bit(1) DEFAULT NULL COMMENT '是否可见',
  `scores` int DEFAULT NULL COMMENT '评分星级',
  `description_scores` int DEFAULT NULL COMMENT '描述星级',
  `benefit_scores` int DEFAULT NULL COMMENT '服务星级',
  `content` text COMMENT '评论内容',
  `pic_urls` text COMMENT '评论图片地址数组',
  `reply_status` bit(1) DEFAULT NULL COMMENT '商家是否回复',
  `reply_user_id` bigint DEFAULT NULL COMMENT '回复管理员编号',
  `reply_content` text COMMENT '商家回复内容',
  `reply_time` datetime DEFAULT NULL COMMENT '商家回复时间',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `product_favorite`;
CREATE TABLE `product_favorite` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `spu_id` bigint DEFAULT NULL COMMENT '商品 SPU 编号',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `product_property`;
CREATE TABLE `product_property` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '名称',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `product_property_value`;
CREATE TABLE `product_property_value` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `property_id` bigint DEFAULT NULL COMMENT '属性项的编号',
  `name` varchar(255) DEFAULT NULL COMMENT '名称',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `product_sku`;
CREATE TABLE `product_sku` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `spu_id` bigint DEFAULT NULL COMMENT 'SPU 编号',
  `properties` text COMMENT '属性数组，JSON 格式',
  `price` int DEFAULT 0 COMMENT '商品价格，单位：分',
  `market_price` int DEFAULT 0 COMMENT '市场价，单位：分',
  `cost_price` int DEFAULT 0 COMMENT '成本价，单位：分',
  `bar_code` varchar(255) DEFAULT NULL COMMENT '商品条码',
  `pic_url` varchar(1024) DEFAULT NULL COMMENT '图片地址',
  `stock` int DEFAULT 0 COMMENT '库存',
  `weight` double DEFAULT NULL COMMENT '商品重量，单位：kg 千克',
  `volume` double DEFAULT NULL COMMENT '商品体积，单位：m^3 平米',
  `first_brokerage_price` int DEFAULT 0 COMMENT '一级分销的佣金，单位：分',
  `second_brokerage_price` int DEFAULT 0 COMMENT '二级分销的佣金，单位：分',
  `sales_count` int DEFAULT 0 COMMENT '商品销量',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `product_spu`;
CREATE TABLE `product_spu` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '商品名称',
  `keyword` varchar(255) DEFAULT NULL COMMENT '关键字',
  `introduction` varchar(255) DEFAULT NULL COMMENT '商品简介',
  `description` text COMMENT '商品详情',
  `category_id` bigint DEFAULT NULL COMMENT '商品分类编号',
  `brand_id` bigint DEFAULT NULL COMMENT '商品品牌编号',
  `pic_url` varchar(1024) DEFAULT NULL COMMENT '商品封面图',
  `slider_pic_urls` text COMMENT '商品轮播图',
  `sort` int DEFAULT 0 COMMENT '排序字段',
  `status` int DEFAULT NULL COMMENT '商品状态',
  `spec_type` bit(1) DEFAULT NULL COMMENT '规格类型',
  `price` int DEFAULT 0 COMMENT '商品价格，单位使用：分',
  `market_price` int DEFAULT 0 COMMENT '市场价，单位使用：分',
  `cost_price` int DEFAULT 0 COMMENT '成本价，单位使用：分',
  `stock` int DEFAULT 0 COMMENT '库存',
  `delivery_types` text COMMENT '配送方式数组',
  `delivery_template_id` bigint DEFAULT NULL COMMENT '物流配置模板编号',
  `customer_visible` bit(1) DEFAULT NULL COMMENT '顾客端是否可见',
  `supplier_id` bigint DEFAULT NULL COMMENT '供应商编号',
  `min_buy_count` int DEFAULT 0 COMMENT '起订量：顾客端每单至少购买的件数，为空或 0 表示不限制；门店收银不受限制',
  `gift_buy_count` int DEFAULT 0 COMMENT '买赠：每买多少件',
  `gift_count` int DEFAULT 0 COMMENT '买赠：赠送多少件（赠送同一规格）',
  `gift_stock_source` int DEFAULT NULL COMMENT '买赠：赠品从哪里扣库存',
  `give_integral` int DEFAULT NULL COMMENT '赠送积分',
  `sub_commission_type` bit(1) DEFAULT NULL COMMENT '分销类型',
  `sales_count` int DEFAULT 0 COMMENT '商品销量',
  `virtual_sales_count` int DEFAULT 0 COMMENT '虚拟销量',
  `browse_count` int DEFAULT 0 COMMENT '浏览量',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `product_statistics`;
CREATE TABLE `product_statistics` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `time` date DEFAULT NULL COMMENT '统计日期',
  `spu_id` bigint DEFAULT NULL COMMENT '商品 SPU 编号',
  `browse_count` int DEFAULT 0 COMMENT '浏览量',
  `browse_user_count` int DEFAULT 0 COMMENT '访客量',
  `favorite_count` int DEFAULT 0 COMMENT '收藏数量',
  `cart_count` int DEFAULT 0 COMMENT '加购数量',
  `order_count` int DEFAULT 0 COMMENT '下单件数',
  `order_pay_count` int DEFAULT 0 COMMENT '支付件数',
  `order_pay_price` int DEFAULT 0 COMMENT '支付金额，单位：分',
  `after_sale_count` int DEFAULT 0 COMMENT '退款件数',
  `after_sale_refund_price` int DEFAULT 0 COMMENT '退款金额，单位：分',
  `browse_convert_percent` int DEFAULT NULL COMMENT '访客支付转化率（百分比）',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_article`;
CREATE TABLE `promotion_article` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `category_id` bigint DEFAULT NULL COMMENT '分类编号 ArticleCategoryDO#id',
  `spu_id` bigint DEFAULT NULL COMMENT '关联商品编号 ProductSpuDO#id',
  `title` varchar(255) DEFAULT NULL COMMENT '文章标题',
  `author` varchar(255) DEFAULT NULL COMMENT '文章作者',
  `pic_url` varchar(1024) DEFAULT NULL COMMENT '文章封面图片地址',
  `introduction` varchar(255) DEFAULT NULL COMMENT '文章简介',
  `browse_count` int DEFAULT 0 COMMENT '浏览次数',
  `sort` int DEFAULT 0 COMMENT '排序',
  `status` int DEFAULT NULL COMMENT '状态',
  `recommend_hot` bit(1) DEFAULT NULL COMMENT '是否热门(小程序)',
  `recommend_banner` bit(1) DEFAULT NULL COMMENT '是否轮播图(小程序)',
  `content` text COMMENT '文章内容',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_article_category`;
CREATE TABLE `promotion_article_category` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '文章分类名称',
  `pic_url` varchar(1024) DEFAULT NULL COMMENT '图标地址',
  `status` int DEFAULT NULL COMMENT '状态',
  `sort` int DEFAULT 0 COMMENT '排序',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_banner`;
CREATE TABLE `promotion_banner` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `title` varchar(255) DEFAULT NULL COMMENT '标题',
  `url` varchar(1024) DEFAULT NULL COMMENT '跳转链接',
  `pic_url` varchar(1024) DEFAULT NULL COMMENT '图片链接',
  `sort` int DEFAULT 0 COMMENT '排序',
  `status` int DEFAULT NULL COMMENT '状态 {@link CommonStatusEnum}',
  `position` int DEFAULT NULL COMMENT '定位 {@link BannerPositionEnum}',
  `memo` text COMMENT '备注',
  `browse_count` int DEFAULT 0 COMMENT '点击次数',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_bargain_activity`;
CREATE TABLE `promotion_bargain_activity` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '砍价活动名称',
  `start_time` datetime DEFAULT NULL COMMENT '活动开始时间',
  `end_time` datetime DEFAULT NULL COMMENT '活动结束时间',
  `status` int DEFAULT NULL COMMENT '活动状态',
  `spu_id` bigint DEFAULT NULL COMMENT '商品 SPU 编号',
  `sku_id` bigint DEFAULT NULL COMMENT '商品 SKU 编号',
  `bargain_first_price` int DEFAULT 0 COMMENT '砍价起始价格，单位：分',
  `bargain_min_price` int DEFAULT 0 COMMENT '砍价底价，单位：分',
  `stock` int DEFAULT 0 COMMENT '砍价库存(剩余库存砍价时扣减)',
  `total_stock` int DEFAULT 0 COMMENT '砍价总库存',
  `help_max_count` int DEFAULT 0 COMMENT '砍价人数',
  `bargain_count` int DEFAULT 0 COMMENT '帮砍次数',
  `total_limit_count` int DEFAULT 0 COMMENT '总限购数量',
  `random_min_price` int DEFAULT 0 COMMENT '用户每次砍价的最小金额，单位：分',
  `random_max_price` int DEFAULT 0 COMMENT '用户每次砍价的最大金额，单位：分',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_bargain_help`;
CREATE TABLE `promotion_bargain_help` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `activity_id` bigint DEFAULT NULL COMMENT '砍价活动编号',
  `record_id` bigint DEFAULT NULL COMMENT '砍价记录编号',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `reduce_price` int DEFAULT 0 COMMENT '减少价格，单位：分',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_bargain_record`;
CREATE TABLE `promotion_bargain_record` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `activity_id` bigint DEFAULT NULL COMMENT '砍价活动编号',
  `spu_id` bigint DEFAULT NULL COMMENT '商品 SPU 编号',
  `sku_id` bigint DEFAULT NULL COMMENT '商品 SKU 编号',
  `bargain_first_price` int DEFAULT 0 COMMENT '砍价起始价格，单位：分',
  `bargain_price` int DEFAULT 0 COMMENT '当前砍价，单位：分',
  `status` int DEFAULT NULL COMMENT '砍价状态',
  `end_time` datetime DEFAULT NULL COMMENT '结束时间',
  `order_id` bigint DEFAULT NULL COMMENT '订单编号',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_combination_activity`;
CREATE TABLE `promotion_combination_activity` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '拼团名称',
  `spu_id` bigint DEFAULT NULL COMMENT '商品 SPU 编号',
  `total_limit_count` int DEFAULT 0 COMMENT '总限购数量',
  `single_limit_count` int DEFAULT 0 COMMENT '单次限购数量',
  `start_time` datetime DEFAULT NULL COMMENT '开始时间',
  `end_time` datetime DEFAULT NULL COMMENT '结束时间',
  `user_size` int DEFAULT NULL COMMENT '几人团',
  `virtual_group` bit(1) DEFAULT NULL COMMENT '虚拟成团',
  `status` int DEFAULT NULL COMMENT '活动状态',
  `limit_duration` int DEFAULT NULL COMMENT '限制时长（小时）',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_combination_product`;
CREATE TABLE `promotion_combination_product` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `activity_id` bigint DEFAULT NULL COMMENT '拼团活动编号',
  `spu_id` bigint DEFAULT NULL COMMENT '商品 SPU 编号',
  `sku_id` bigint DEFAULT NULL COMMENT '商品 SKU 编号',
  `combination_price` int DEFAULT 0 COMMENT '拼团价格，单位分',
  `activity_status` int DEFAULT NULL COMMENT '拼团商品状态',
  `activity_start_time` datetime DEFAULT NULL COMMENT '活动开始时间点',
  `activity_end_time` datetime DEFAULT NULL COMMENT '活动结束时间点',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_combination_record`;
CREATE TABLE `promotion_combination_record` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `activity_id` bigint DEFAULT NULL COMMENT '拼团活动编号',
  `combination_price` int DEFAULT 0 COMMENT '拼团商品单价',
  `spu_id` bigint DEFAULT NULL COMMENT 'SPU 编号',
  `spu_name` varchar(255) DEFAULT NULL COMMENT '商品名字',
  `pic_url` varchar(1024) DEFAULT NULL COMMENT '商品图片',
  `sku_id` bigint DEFAULT NULL COMMENT 'SKU 编号',
  `count` int DEFAULT 0 COMMENT '购买的商品数量',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `nickname` varchar(255) DEFAULT NULL COMMENT '用户昵称',
  `avatar` varchar(1024) DEFAULT NULL COMMENT '用户头像',
  `head_id` bigint DEFAULT NULL COMMENT '团长编号',
  `status` int DEFAULT NULL COMMENT '开团状态',
  `order_id` bigint DEFAULT NULL COMMENT '订单编号',
  `user_size` int DEFAULT NULL COMMENT '开团需要人数',
  `user_count` int DEFAULT 0 COMMENT '已加入拼团人数',
  `virtual_group` bit(1) DEFAULT NULL COMMENT '是否虚拟成团',
  `expire_time` datetime DEFAULT NULL COMMENT '过期时间',
  `start_time` datetime DEFAULT NULL COMMENT '开始时间 (订单付款后开始的时间)',
  `end_time` datetime DEFAULT NULL COMMENT '结束时间（成团时间/失败时间）',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_coupon`;
CREATE TABLE `promotion_coupon` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `template_id` bigint DEFAULT NULL COMMENT '优惠劵模板编号',
  `name` varchar(255) DEFAULT NULL COMMENT '优惠劵名',
  `status` int DEFAULT NULL COMMENT '优惠码状态',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `take_type` int DEFAULT NULL COMMENT '领取类型',
  `use_price` int DEFAULT 0 COMMENT '是否设置满多少金额可用，单位：分',
  `valid_start_time` datetime DEFAULT NULL COMMENT '生效开始时间',
  `valid_end_time` datetime DEFAULT NULL COMMENT '生效结束时间',
  `product_scope` int DEFAULT NULL COMMENT '商品范围',
  `product_scope_values` text COMMENT '商品范围编号的数组',
  `discount_type` int DEFAULT NULL COMMENT '折扣类型',
  `discount_percent` int DEFAULT NULL COMMENT '折扣百分比',
  `discount_price` int DEFAULT 0 COMMENT '优惠金额，单位：分',
  `discount_limit_price` int DEFAULT 0 COMMENT '折扣上限，仅在 {@link #discountType} 等于 {@link PromotionDiscountTypeEnum#PERCENT} 时生效',
  `use_order_id` bigint DEFAULT NULL COMMENT '使用订单号',
  `use_time` datetime DEFAULT NULL COMMENT '使用时间',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_coupon_template`;
CREATE TABLE `promotion_coupon_template` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '优惠劵名',
  `description` text COMMENT '优惠券说明',
  `status` int DEFAULT NULL,
  `total_count` int DEFAULT 0 COMMENT '状态',
  `take_limit_count` int DEFAULT 0 COMMENT '每人限领个数',
  `take_type` int DEFAULT NULL COMMENT '领取方式',
  `use_price` int DEFAULT 0 COMMENT '是否设置满多少金额可用，单位：分',
  `product_scope` int DEFAULT NULL COMMENT '商品范围',
  `product_scope_values` text COMMENT '商品范围编号的数组',
  `validity_type` int DEFAULT NULL COMMENT '生效日期类型',
  `valid_start_time` datetime DEFAULT NULL COMMENT '固定日期 - 生效开始时间',
  `valid_end_time` datetime DEFAULT NULL COMMENT '固定日期 - 生效结束时间',
  `fixed_start_term` int DEFAULT NULL COMMENT '领取日期 - 开始天数',
  `fixed_end_term` int DEFAULT NULL COMMENT '领取日期 - 结束天数',
  `discount_type` int DEFAULT NULL COMMENT '折扣类型',
  `discount_percent` int DEFAULT NULL COMMENT '折扣百分比',
  `discount_price` int DEFAULT 0 COMMENT '优惠金额，单位：分',
  `discount_limit_price` int DEFAULT 0 COMMENT '折扣上限，仅在 {@link #discountType} 等于 {@link PromotionDiscountTypeEnum#PERCENT} 时生效',
  `take_count` int DEFAULT 0 COMMENT '领取优惠券的数量',
  `use_count` int DEFAULT 0 COMMENT '使用优惠券的次数',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_discount_activity`;
CREATE TABLE `promotion_discount_activity` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '活动标题',
  `status` int DEFAULT NULL COMMENT '状态',
  `start_time` datetime DEFAULT NULL COMMENT '开始时间',
  `end_time` datetime DEFAULT NULL COMMENT '结束时间',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_discount_product`;
CREATE TABLE `promotion_discount_product` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `activity_id` bigint DEFAULT NULL COMMENT '限时折扣活动的编号',
  `spu_id` bigint DEFAULT NULL COMMENT '商品 SPU 编号',
  `sku_id` bigint DEFAULT NULL COMMENT '商品 SKU 编号',
  `discount_type` int DEFAULT NULL COMMENT '折扣类型',
  `discount_percent` int DEFAULT NULL COMMENT '折扣百分比',
  `discount_price` int DEFAULT 0 COMMENT '优惠金额，单位：分',
  `activity_name` varchar(255) DEFAULT NULL COMMENT '活动标题',
  `activity_status` int DEFAULT NULL COMMENT '活动状态',
  `activity_start_time` datetime DEFAULT NULL COMMENT '活动开始时间点',
  `activity_end_time` datetime DEFAULT NULL COMMENT '活动结束时间点',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_diy_page`;
CREATE TABLE `promotion_diy_page` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `template_id` bigint DEFAULT NULL COMMENT '装修模板编号',
  `name` varchar(255) DEFAULT NULL COMMENT '页面名称',
  `remark` text COMMENT '备注',
  `preview_pic_urls` text COMMENT '预览图，多个逗号分隔',
  `property` longtext COMMENT '页面属性，JSON 格式',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_diy_template`;
CREATE TABLE `promotion_diy_template` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '模板名称',
  `used` bit(1) DEFAULT NULL COMMENT '是否使用',
  `used_time` datetime DEFAULT NULL COMMENT '使用时间',
  `remark` text COMMENT '备注',
  `preview_pic_urls` text COMMENT '预览图',
  `property` longtext COMMENT 'uni-app 底部导航属性，JSON 格式',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_kefu_conversation`;
CREATE TABLE `promotion_kefu_conversation` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `user_id` bigint DEFAULT NULL COMMENT '会话所属用户',
  `last_message_time` datetime DEFAULT NULL COMMENT '最后聊天时间',
  `last_message_content` text COMMENT '最后聊天内容',
  `last_message_content_type` int DEFAULT NULL COMMENT '最后发送的消息类型',
  `admin_pinned` bit(1) DEFAULT NULL COMMENT '管理端置顶',
  `user_deleted` bit(1) DEFAULT NULL COMMENT '用户是否可见',
  `admin_deleted` bit(1) DEFAULT NULL COMMENT '管理员是否可见',
  `admin_unread_message_count` int DEFAULT 0 COMMENT '管理员未读消息数',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_kefu_message`;
CREATE TABLE `promotion_kefu_message` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `conversation_id` bigint DEFAULT NULL COMMENT '会话编号',
  `sender_id` bigint DEFAULT NULL COMMENT '发送人编号',
  `sender_type` int DEFAULT NULL COMMENT '发送人类型',
  `receiver_id` bigint DEFAULT NULL COMMENT '接收人编号',
  `receiver_type` int DEFAULT NULL COMMENT '接收人类型',
  `content_type` int DEFAULT NULL COMMENT '消息类型',
  `content` text COMMENT '消息',
  `read_status` bit(1) DEFAULT NULL COMMENT '是/否已读',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_point_activity`;
CREATE TABLE `promotion_point_activity` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `spu_id` bigint DEFAULT NULL COMMENT '积分商城活动商品',
  `status` int DEFAULT NULL COMMENT '活动状态',
  `remark` text COMMENT '备注',
  `sort` int DEFAULT 0 COMMENT '排序',
  `stock` int DEFAULT 0 COMMENT '积分商城活动库存(剩余库存积分兑换时扣减)',
  `total_stock` int DEFAULT 0 COMMENT '积分商城活动总库存',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_point_product`;
CREATE TABLE `promotion_point_product` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `activity_id` bigint DEFAULT NULL COMMENT '积分商城活动 id',
  `spu_id` bigint DEFAULT NULL COMMENT '商品 SPU 编号',
  `sku_id` bigint DEFAULT NULL COMMENT '商品 SKU 编号',
  `count` int DEFAULT 0 COMMENT '可兑换次数',
  `point` int DEFAULT 0 COMMENT '所需兑换积分',
  `price` int DEFAULT 0 COMMENT '所需兑换金额，单位：分',
  `stock` int DEFAULT 0 COMMENT '积分商城商品库存',
  `activity_status` int DEFAULT NULL COMMENT '积分商城商品状态',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_reward_activity`;
CREATE TABLE `promotion_reward_activity` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '活动标题',
  `status` int DEFAULT NULL COMMENT '状态',
  `start_time` datetime DEFAULT NULL COMMENT '开始时间',
  `end_time` datetime DEFAULT NULL COMMENT '结束时间',
  `remark` text COMMENT '备注',
  `condition_type` int DEFAULT NULL COMMENT '条件类型',
  `product_scope` int DEFAULT NULL COMMENT '商品范围',
  `product_scope_values` text COMMENT '商品 SPU 编号的数组',
  `rules` text COMMENT '优惠规则的数组',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_seckill_activity`;
CREATE TABLE `promotion_seckill_activity` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `spu_id` bigint DEFAULT NULL COMMENT '秒杀活动商品',
  `name` varchar(255) DEFAULT NULL COMMENT '秒杀活动名称',
  `status` int DEFAULT NULL COMMENT '活动状态',
  `remark` text COMMENT '备注',
  `start_time` datetime DEFAULT NULL COMMENT '活动开始时间',
  `end_time` datetime DEFAULT NULL COMMENT '活动结束时间',
  `sort` int DEFAULT 0 COMMENT '排序',
  `config_ids` text COMMENT '秒杀时段 id',
  `total_limit_count` int DEFAULT 0 COMMENT '总限购数量',
  `single_limit_count` int DEFAULT 0 COMMENT '单次限够数量',
  `stock` int DEFAULT 0 COMMENT '秒杀库存(剩余库存秒杀时扣减)',
  `total_stock` int DEFAULT 0 COMMENT '秒杀总库存',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_seckill_config`;
CREATE TABLE `promotion_seckill_config` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '秒杀时段名称',
  `start_time` varchar(255) DEFAULT NULL COMMENT '开始时间点',
  `end_time` varchar(255) DEFAULT NULL COMMENT '结束时间点',
  `slider_pic_urls` text COMMENT '秒杀轮播图',
  `status` int DEFAULT NULL COMMENT '状态',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `promotion_seckill_product`;
CREATE TABLE `promotion_seckill_product` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `activity_id` bigint DEFAULT NULL COMMENT '秒杀活动 id',
  `config_ids` text COMMENT '秒杀时段 id',
  `spu_id` bigint DEFAULT NULL COMMENT '商品 SPU 编号',
  `sku_id` bigint DEFAULT NULL COMMENT '商品 SKU 编号',
  `seckill_price` int DEFAULT 0 COMMENT '秒杀金额，单位：分',
  `stock` int DEFAULT 0 COMMENT '秒杀库存',
  `activity_status` int DEFAULT NULL COMMENT '秒杀商品状态',
  `activity_start_time` datetime DEFAULT NULL COMMENT '活动开始时间点',
  `activity_end_time` datetime DEFAULT NULL COMMENT '活动结束时间点',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_after_sale`;
CREATE TABLE `trade_after_sale` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '售后单号',
  `status` int DEFAULT NULL COMMENT '退款状态',
  `way` int DEFAULT NULL COMMENT '售后方式',
  `type` int DEFAULT NULL COMMENT '售后类型',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `apply_reason` varchar(255) DEFAULT NULL COMMENT '申请原因',
  `apply_description` text COMMENT '补充描述',
  `apply_pic_urls` text COMMENT '补充凭证图片',
  `order_id` bigint DEFAULT NULL COMMENT '交易订单编号',
  `order_no` varchar(255) DEFAULT NULL COMMENT '订单流水号',
  `order_item_id` bigint DEFAULT NULL COMMENT '交易订单项编号',
  `spu_id` bigint DEFAULT NULL COMMENT '商品 SPU 编号',
  `spu_name` varchar(255) DEFAULT NULL COMMENT '商品 SPU 名称',
  `sku_id` bigint DEFAULT NULL COMMENT '商品 SKU 编号',
  `properties` text COMMENT '属性数组，JSON 格式',
  `pic_url` varchar(1024) DEFAULT NULL COMMENT '商品图片',
  `count` int DEFAULT 0 COMMENT '退货商品数量',
  `audit_time` datetime DEFAULT NULL COMMENT '审批时间',
  `audit_user_id` bigint DEFAULT NULL COMMENT '审批人',
  `audit_reason` varchar(255) DEFAULT NULL COMMENT '审批备注',
  `refund_price` int DEFAULT 0 COMMENT '退款金额，单位：分。',
  `pay_refund_id` bigint DEFAULT NULL COMMENT '支付退款编号',
  `refund_time` datetime DEFAULT NULL COMMENT '退款时间',
  `logistics_id` bigint DEFAULT NULL COMMENT '退货物流公司编号',
  `logistics_no` varchar(255) DEFAULT NULL COMMENT '退货物流单号',
  `delivery_time` datetime DEFAULT NULL COMMENT '退货时间',
  `receive_time` datetime DEFAULT NULL COMMENT '收货时间',
  `receive_reason` varchar(255) DEFAULT NULL COMMENT '收货备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_after_sale_log`;
CREATE TABLE `trade_after_sale_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `user_type` int DEFAULT NULL COMMENT '用户类型',
  `after_sale_id` bigint DEFAULT NULL COMMENT '售后编号',
  `before_status` int DEFAULT NULL COMMENT '操作前状态',
  `after_status` int DEFAULT NULL COMMENT '操作后状态',
  `operate_type` int DEFAULT NULL COMMENT '操作类型',
  `content` text COMMENT '操作明细',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_brokerage_record`;
CREATE TABLE `trade_brokerage_record` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `biz_id` varchar(255) DEFAULT NULL COMMENT '业务编号',
  `biz_type` int DEFAULT NULL COMMENT '业务类型',
  `title` varchar(255) DEFAULT NULL COMMENT '标题',
  `description` text COMMENT '说明',
  `price` int DEFAULT 0 COMMENT '金额',
  `total_price` int DEFAULT 0 COMMENT '当前总佣金',
  `status` int DEFAULT NULL COMMENT '状态',
  `frozen_days` int DEFAULT NULL COMMENT '冻结时间（天）',
  `unfreeze_time` datetime DEFAULT NULL COMMENT '解冻时间',
  `source_user_level` int DEFAULT NULL COMMENT '来源用户等级',
  `source_user_id` bigint DEFAULT NULL COMMENT '来源用户编号',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_brokerage_user`;
CREATE TABLE `trade_brokerage_user` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `bind_user_id` bigint DEFAULT NULL COMMENT '推广员编号',
  `bind_user_time` datetime DEFAULT NULL COMMENT '推广员绑定时间',
  `brokerage_enabled` bit(1) DEFAULT NULL COMMENT '是否有分销资格',
  `brokerage_time` datetime DEFAULT NULL COMMENT '成为分销员时间',
  `brokerage_price` int DEFAULT 0 COMMENT '可用佣金',
  `frozen_price` int DEFAULT 0 COMMENT '冻结佣金',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_brokerage_withdraw`;
CREATE TABLE `trade_brokerage_withdraw` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `price` int DEFAULT 0 COMMENT '提现金额，单位：分',
  `fee_price` int DEFAULT 0 COMMENT '提现手续费，单位：分',
  `total_price` int DEFAULT 0 COMMENT '当前总佣金，单位：分',
  `type` int DEFAULT NULL COMMENT '提现类型',
  `user_name` varchar(255) DEFAULT NULL COMMENT '提现姓名',
  `user_account` varchar(255) DEFAULT NULL COMMENT '提现账号',
  `qr_code_url` varchar(1024) DEFAULT NULL COMMENT '收款码',
  `bank_name` varchar(255) DEFAULT NULL COMMENT '银行名称',
  `bank_address` varchar(1024) DEFAULT NULL COMMENT '开户地址',
  `status` int DEFAULT NULL COMMENT '状态',
  `audit_reason` varchar(255) DEFAULT NULL COMMENT '审核驳回原因',
  `audit_time` datetime DEFAULT NULL COMMENT '审核时间',
  `remark` text COMMENT '备注',
  `pay_transfer_id` bigint DEFAULT NULL COMMENT '转账单编号',
  `transfer_channel_code` varchar(255) DEFAULT NULL COMMENT '转账渠道',
  `transfer_time` datetime DEFAULT NULL COMMENT '转账成功时间',
  `transfer_error_msg` varchar(255) DEFAULT NULL COMMENT '转账错误提示',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_cart`;
CREATE TABLE `trade_cart` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `spu_id` bigint DEFAULT NULL COMMENT '商品 SPU 编号',
  `sku_id` bigint DEFAULT NULL COMMENT '商品 SKU 编号',
  `count` int DEFAULT 0 COMMENT '商品购买数量',
  `selected` bit(1) DEFAULT NULL COMMENT '是否选中',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_config`;
CREATE TABLE `trade_config` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `after_sale_refund_reasons` text COMMENT '售后的退款理由',
  `after_sale_return_reasons` text COMMENT '售后的退货理由',
  `delivery_express_free_enabled` bit(1) DEFAULT NULL COMMENT '是否启用全场包邮',
  `delivery_express_free_price` int DEFAULT 0 COMMENT '全场包邮的最小金额，单位：分',
  `delivery_pick_up_enabled` bit(1) DEFAULT NULL COMMENT '是否开启自提',
  `ward_delivery_name` varchar(255) DEFAULT NULL COMMENT '配送方式名称，默认“送到病房”',
  `ward_area_label` varchar(255) DEFAULT NULL COMMENT '区域的叫法（二维码按区域划分），默认“病区”',
  `ward_spot_label` varchar(255) DEFAULT NULL COMMENT '位置的叫法（顾客下单时填写），默认“床号”',
  `ward_spot_required` bit(1) DEFAULT NULL COMMENT '位置是否必填，默认必填',
  `brokerage_enabled` bit(1) DEFAULT NULL COMMENT '是否启用分佣',
  `brokerage_enabled_condition` int DEFAULT NULL COMMENT '分佣模式',
  `brokerage_bind_mode` int DEFAULT NULL COMMENT '分销关系绑定模式',
  `brokerage_poster_urls` text COMMENT '分销海报图地址数组',
  `brokerage_first_percent` int DEFAULT NULL COMMENT '一级返佣比例',
  `brokerage_second_percent` int DEFAULT NULL COMMENT '二级返佣比例',
  `brokerage_withdraw_min_price` int DEFAULT 0 COMMENT '用户提现最低金额',
  `brokerage_withdraw_fee_percent` int DEFAULT NULL COMMENT '用户提现手续费百分比',
  `brokerage_frozen_days` int DEFAULT NULL COMMENT '佣金冻结时间(天)',
  `brokerage_withdraw_types` text COMMENT '提现方式',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_delivery_express`;
CREATE TABLE `trade_delivery_express` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `code` varchar(255) DEFAULT NULL COMMENT '快递公司 code',
  `name` varchar(255) DEFAULT NULL COMMENT '快递公司名称',
  `logo` varchar(255) DEFAULT NULL COMMENT '快递公司 logo',
  `sort` int DEFAULT 0 COMMENT '排序',
  `status` int DEFAULT NULL COMMENT '状态',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_delivery_express_template`;
CREATE TABLE `trade_delivery_express_template` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '模板名称',
  `charge_mode` int DEFAULT NULL COMMENT '配送计费方式',
  `sort` int DEFAULT 0 COMMENT '排序',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_delivery_express_template_charge`;
CREATE TABLE `trade_delivery_express_template_charge` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `template_id` bigint DEFAULT NULL COMMENT '配送模板编号',
  `area_ids` text COMMENT '配送区域编号列表',
  `charge_mode` int DEFAULT NULL COMMENT '配送计费方式',
  `start_count` double DEFAULT NULL COMMENT '首件数量(件数,重量，或体积)',
  `start_price` int DEFAULT 0 COMMENT '起步价，单位：分',
  `extra_count` double DEFAULT NULL COMMENT '续件数量(件, 重量，或体积)',
  `extra_price` int DEFAULT 0 COMMENT '额外价，单位：分',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_delivery_express_template_free`;
CREATE TABLE `trade_delivery_express_template_free` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `template_id` bigint DEFAULT NULL COMMENT '配送模板编号',
  `area_ids` text COMMENT '配送区域编号列表',
  `free_price` int DEFAULT 0 COMMENT '包邮金额，单位：分',
  `free_count` int DEFAULT 0 COMMENT '包邮件数',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_delivery_pick_up_store`;
CREATE TABLE `trade_delivery_pick_up_store` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '门店名称',
  `introduction` varchar(255) DEFAULT NULL COMMENT '门店简介',
  `phone` varchar(255) DEFAULT NULL COMMENT '门店手机',
  `area_id` int DEFAULT NULL COMMENT '区域编号',
  `detail_address` varchar(1024) DEFAULT NULL COMMENT '门店详细地址',
  `logo` varchar(255) DEFAULT NULL COMMENT '门店 logo',
  `opening_time` time DEFAULT NULL COMMENT '营业开始时间',
  `closing_time` time DEFAULT NULL COMMENT '营业结束时间',
  `latitude` double DEFAULT NULL COMMENT '纬度',
  `longitude` double DEFAULT NULL COMMENT '经度',
  `verify_user_ids` text COMMENT '核销员工用户编号数组',
  `status` int DEFAULT NULL COMMENT '门店状态',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_delivery_ward`;
CREATE TABLE `trade_delivery_ward` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) DEFAULT NULL COMMENT '病区名称，例如：内科一病区',
  `location` varchar(255) DEFAULT NULL COMMENT '位置，例如：住院部 A 栋 5 楼',
  `sort` int DEFAULT 0 COMMENT '排序',
  `status` int DEFAULT NULL COMMENT '状态',
  `remark` text COMMENT '备注',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_order`;
CREATE TABLE `trade_order` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '订单流水号',
  `type` int DEFAULT NULL COMMENT '订单类型',
  `terminal` int DEFAULT NULL COMMENT '订单来源',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `user_ip` varchar(255) DEFAULT NULL COMMENT '用户 IP',
  `user_remark` text COMMENT '用户备注',
  `status` int DEFAULT NULL COMMENT '订单状态',
  `product_count` int DEFAULT 0 COMMENT '购买的商品数量',
  `finish_time` datetime DEFAULT NULL COMMENT '订单完成时间',
  `cancel_time` datetime DEFAULT NULL COMMENT '订单取消时间',
  `cancel_type` int DEFAULT NULL COMMENT '取消类型',
  `remark` text COMMENT '商家备注',
  `comment_status` bit(1) DEFAULT NULL COMMENT '是否评价',
  `brokerage_user_id` bigint DEFAULT NULL COMMENT '推广人编号',
  `pay_order_id` bigint DEFAULT NULL COMMENT '支付订单编号',
  `pay_status` bit(1) DEFAULT NULL COMMENT '是否已支付',
  `pay_time` datetime DEFAULT NULL COMMENT '付款时间',
  `pay_channel_code` varchar(255) DEFAULT NULL COMMENT '支付渠道',
  `total_price` int DEFAULT 0 COMMENT '商品原价，单位：分',
  `discount_price` int DEFAULT 0 COMMENT '优惠金额，单位：分',
  `delivery_price` int DEFAULT 0 COMMENT '运费金额，单位：分',
  `adjust_price` int DEFAULT 0 COMMENT '订单调价，单位：分',
  `pay_price` int DEFAULT 0 COMMENT '应付金额（总），单位：分',
  `delivery_type` int DEFAULT NULL COMMENT '配送方式',
  `logistics_id` bigint DEFAULT NULL COMMENT '发货物流公司编号',
  `logistics_no` varchar(255) DEFAULT NULL COMMENT '发货物流单号',
  `delivery_time` datetime DEFAULT NULL COMMENT '发货时间',
  `receive_time` datetime DEFAULT NULL COMMENT '收货时间',
  `receiver_name` varchar(255) DEFAULT NULL COMMENT '收件人名称',
  `receiver_mobile` varchar(255) DEFAULT NULL COMMENT '收件人手机',
  `receiver_area_id` int DEFAULT NULL COMMENT '收件人地区编号',
  `receiver_detail_address` varchar(1024) DEFAULT NULL COMMENT '收件人详细地址',
  `pick_up_store_id` bigint DEFAULT NULL COMMENT '自提门店编号',
  `pick_up_verify_code` varchar(255) DEFAULT NULL COMMENT '自提核销码',
  `ward_id` bigint DEFAULT NULL COMMENT '病区编号',
  `ward_name` varchar(255) DEFAULT NULL COMMENT '病区名称（下单时的快照）',
  `bed_no` varchar(255) DEFAULT NULL COMMENT '床号，病房配送时必填',
  `refund_status` int DEFAULT NULL COMMENT '售后状态',
  `refund_price` int DEFAULT 0 COMMENT '退款金额，单位：分',
  `coupon_id` bigint DEFAULT NULL COMMENT '优惠劵编号',
  `coupon_price` int DEFAULT 0 COMMENT '优惠劵减免金额，单位：分',
  `use_point` int DEFAULT 0 COMMENT '使用的积分',
  `point_price` int DEFAULT 0 COMMENT '积分抵扣的金额，单位：分',
  `give_point` int DEFAULT 0 COMMENT '赠送的积分',
  `refund_point` int DEFAULT 0 COMMENT '退还的使用的积分',
  `vip_price` int DEFAULT 0 COMMENT 'VIP 减免金额，单位：分',
  `give_coupon_template_counts` text COMMENT '赠送的优惠劵',
  `give_coupon_ids` text COMMENT '赠送的优惠劵编号',
  `seckill_activity_id` bigint DEFAULT NULL COMMENT '秒杀活动编号',
  `bargain_activity_id` bigint DEFAULT NULL COMMENT '砍价活动编号',
  `bargain_record_id` bigint DEFAULT NULL COMMENT '砍价记录编号',
  `combination_activity_id` bigint DEFAULT NULL COMMENT '拼团活动编号',
  `combination_head_id` bigint DEFAULT NULL COMMENT '拼团团长编号',
  `combination_record_id` bigint DEFAULT NULL COMMENT '拼团记录编号',
  `point_activity_id` bigint DEFAULT NULL COMMENT '积分商城活动的编号',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_order_item`;
CREATE TABLE `trade_order_item` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `order_id` bigint DEFAULT NULL COMMENT '订单编号',
  `cart_id` bigint DEFAULT NULL COMMENT '购物车项编号',
  `spu_id` bigint DEFAULT NULL COMMENT '商品 SPU 编号',
  `spu_name` varchar(255) DEFAULT NULL COMMENT '商品 SPU 名称',
  `sku_id` bigint DEFAULT NULL COMMENT '商品 SKU 编号',
  `properties` text COMMENT '属性数组，JSON 格式',
  `pic_url` varchar(1024) DEFAULT NULL COMMENT '商品图片',
  `count` int DEFAULT 0 COMMENT '购买数量',
  `comment_status` bit(1) DEFAULT NULL COMMENT '是否评价',
  `price` int DEFAULT 0 COMMENT '商品原价（单），单位：分',
  `discount_price` int DEFAULT 0 COMMENT '优惠金额（总），单位：分',
  `delivery_price` int DEFAULT 0 COMMENT '运费金额（总），单位：分',
  `adjust_price` int DEFAULT 0 COMMENT '订单调价（总），单位：分',
  `pay_price` int DEFAULT 0 COMMENT '应付金额（总），单位：分',
  `coupon_price` int DEFAULT 0 COMMENT '优惠劵减免金额，单位：分',
  `point_price` int DEFAULT 0 COMMENT '积分抵扣的金额，单位：分',
  `use_point` int DEFAULT 0 COMMENT '使用的积分',
  `give_point` int DEFAULT 0 COMMENT '赠送的积分',
  `vip_price` int DEFAULT 0 COMMENT 'VIP 减免金额，单位：分',
  `after_sale_id` bigint DEFAULT NULL COMMENT '售后单编号',
  `after_sale_status` int DEFAULT NULL COMMENT '售后状态',
  `supplier_id` bigint DEFAULT NULL COMMENT '供应商编号，下单时从商品 SPU 复制，用于每月按供应商对账',
  `cost_price` int DEFAULT 0 COMMENT '成本价，单位：分。下单时从商品 SKU 复制',
  `gift_count` int DEFAULT 0 COMMENT '赠送件数（买赠），下单时按商品的买赠规则计算',
  `gift_stock_source` int DEFAULT NULL COMMENT '赠品库存来源',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_order_log`;
CREATE TABLE `trade_order_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `user_id` bigint DEFAULT NULL COMMENT '用户编号',
  `user_type` int DEFAULT NULL COMMENT '用户类型',
  `order_id` bigint DEFAULT NULL COMMENT '订单号',
  `before_status` int DEFAULT NULL COMMENT '操作前状态',
  `after_status` int DEFAULT NULL COMMENT '操作后状态',
  `operate_type` int DEFAULT NULL COMMENT '操作类型',
  `content` text COMMENT '订单日志信息',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_pos_order`;
CREATE TABLE `trade_pos_order` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `no` varchar(255) DEFAULT NULL COMMENT '收银单号',
  `status` int DEFAULT NULL COMMENT '状态',
  `product_count` int DEFAULT 0 COMMENT '商品件数（不含赠品）',
  `total_price` int DEFAULT 0 COMMENT '应收金额，单位：分',
  `pay_type` int DEFAULT NULL COMMENT '收款方式',
  `received_price` int DEFAULT 0 COMMENT '实收金额，单位：分。现金收款时为顾客给的金额，其它方式等于应收金额',
  `change_price` int DEFAULT 0 COMMENT '找零金额，单位：分',
  `cashier_id` bigint DEFAULT NULL COMMENT '收银员编号',
  `cashier_name` varchar(255) DEFAULT NULL COMMENT '收银员名字',
  `remark` text COMMENT '备注',
  `cancel_time` datetime DEFAULT NULL COMMENT '作废时间',
  `cancel_reason` varchar(255) DEFAULT NULL COMMENT '作废原因',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_pos_order_item`;
CREATE TABLE `trade_pos_order_item` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `order_id` bigint DEFAULT NULL COMMENT '收银单编号',
  `spu_id` bigint DEFAULT NULL COMMENT '商品 SPU 编号',
  `spu_name` varchar(255) DEFAULT NULL COMMENT '商品名字',
  `sku_id` bigint DEFAULT NULL COMMENT '商品 SKU 编号',
  `sku_name` varchar(255) DEFAULT NULL COMMENT '规格名字，例如：包装:两片装；单规格商品为空',
  `pic_url` varchar(1024) DEFAULT NULL COMMENT '商品图片',
  `price` int DEFAULT 0 COMMENT '单价，单位：分',
  `count` int DEFAULT 0 COMMENT '购买件数',
  `total_price` int DEFAULT 0 COMMENT '小计金额，单位：分',
  `gift_count` int DEFAULT 0 COMMENT '赠送件数（买赠）',
  `gift_stock_source` int DEFAULT NULL COMMENT '赠品库存来源',
  `supplier_id` bigint DEFAULT NULL COMMENT '供应商编号，收银时从商品复制，用于每月按供应商对账',
  `cost_price` int DEFAULT 0 COMMENT '成本价，单位：分。收银时从商品 SKU 复制',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_sku_material`;
CREATE TABLE `trade_sku_material` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `spu_id` bigint DEFAULT NULL COMMENT '商品 SPU 编号',
  `sku_id` bigint DEFAULT NULL COMMENT '商品 SKU 编号',
  `erp_product_id` bigint DEFAULT NULL COMMENT '库存物料编号，即 ERP 产品编号',
  `quantity` decimal(24,6) DEFAULT 0 COMMENT '每卖出 1 件该规格，扣减的物料数量',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `trade_statistics`;
CREATE TABLE `trade_statistics` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
  `time` datetime DEFAULT NULL COMMENT '统计日期',
  `order_create_count` int DEFAULT 0 COMMENT '创建订单数',
  `order_pay_count` int DEFAULT 0 COMMENT '支付订单商品数',
  `order_pay_price` int DEFAULT 0 COMMENT '总支付金额，单位：分',
  `after_sale_count` int DEFAULT 0 COMMENT '退款订单数',
  `after_sale_refund_price` int DEFAULT 0 COMMENT '总退款金额，单位：分',
  `brokerage_settlement_price` int DEFAULT 0 COMMENT '佣金金额（已结算），单位：分',
  `wallet_pay_price` int DEFAULT 0 COMMENT '总支付金额（余额），单位：分',
  `recharge_pay_count` int DEFAULT 0 COMMENT '充值订单数',
  `recharge_pay_price` int DEFAULT 0 COMMENT '充值金额，单位：分',
  `recharge_refund_count` int DEFAULT 0 COMMENT '充值退款订单数',
  `recharge_refund_price` int DEFAULT 0 COMMENT '充值退款金额，单位：分',
  `creator` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
  `tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
