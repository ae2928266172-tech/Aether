package cn.iocoder.yudao.module.product.dal.dataobject.spu;

import cn.iocoder.yudao.framework.mybatis.core.dataobject.BaseDO;
import cn.iocoder.yudao.framework.mybatis.core.type.IntegerListTypeHandler;
import cn.iocoder.yudao.module.product.dal.dataobject.brand.ProductBrandDO;
import cn.iocoder.yudao.module.product.dal.dataobject.category.ProductCategoryDO;
import cn.iocoder.yudao.module.product.dal.dataobject.sku.ProductSkuDO;
import cn.iocoder.yudao.module.product.enums.spu.ProductSpuGiftStockSourceEnum;
import cn.iocoder.yudao.module.product.enums.spu.ProductSpuStatusEnum;
import com.baomidou.mybatisplus.annotation.KeySequence;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.*;

import java.util.List;

/**
 * 商品 SPU DO
 *
 * @author 芋道源码
 */
@TableName(value = "product_spu", autoResultMap = true)
@KeySequence("product_spu_seq") // 用于 Oracle、PostgreSQL、Kingbase、DB2、H2 数据库的主键自增。如果是 MySQL 等数据库，可不写。
@Data
@EqualsAndHashCode(callSuper = true)
@ToString(callSuper = true)
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProductSpuDO extends BaseDO {

    /**
     * 商品 SPU 编号，自增
     */
    @TableId
    private Long id;

    // ========== 基本信息 =========

    /**
     * 商品名称
     */
    private String name;
    /**
     * 关键字
     */
    private String keyword;
    /**
     * 商品简介
     */
    private String introduction;
    /**
     * 商品详情
     */
    private String description;

    /**
     * 商品分类编号
     *
     * 关联 {@link ProductCategoryDO#getId()}
     */
    private Long categoryId;
    /**
     * 商品品牌编号
     *
     * 关联 {@link ProductBrandDO#getId()}
     */
    private Long brandId;
    /**
     * 商品封面图
     */
    private String picUrl;
    /**
     * 商品轮播图
     */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> sliderPicUrls;

    /**
     * 排序字段
     */
    private Integer sort;
    /**
     * 商品状态
     *
     * 枚举 {@link ProductSpuStatusEnum}
     */
    private Integer status;

    // ========== SKU 相关字段 =========

    /**
     * 规格类型
     *
     * false - 单规格
     * true - 多规格
     */
    private Boolean specType;
    /**
     * 商品价格，单位使用：分
     *
     * 基于其对应的 {@link ProductSkuDO#getPrice()} sku单价最低的商品的
     */
    private Integer price;
    /**
     * 市场价，单位使用：分
     *
     * 基于其对应的 {@link ProductSkuDO#getMarketPrice()} sku单价最低的商品的
     */
    private Integer marketPrice;
    /**
     * 成本价，单位使用：分
     *
     * 基于其对应的 {@link ProductSkuDO#getCostPrice()} sku单价最低的商品的
     */
    private Integer costPrice;
    /**
     * 库存
     *
     * 基于其对应的 {@link ProductSkuDO#getStock()} 求和
     */
    private Integer stock;

    // ========== 物流相关字段 =========

    /**
     * 配送方式数组
     *
     * 对应 DeliveryTypeEnum 枚举
     */
    @TableField(typeHandler = IntegerListTypeHandler.class)
    private List<Integer> deliveryTypes;
    /**
     * 物流配置模板编号
     *
     * 对应 TradeDeliveryExpressTemplateDO 的 id 编号
     */
    private Long deliveryTemplateId;
    /**
     * 顾客端是否可见
     *
     * false 时只在门店收银台售卖，病人在小程序 / H5 看不到、也不能下单（例如价格太低、不值得配送到病区的商品）
     */
    private Boolean customerVisible;

    // ========== 供应商相关字段 =========

    /**
     * 供应商编号
     *
     * 对应 ErpSupplierDO 的 id 编号，用于每月按供应商对账
     */
    private Long supplierId;

    // ========== 起订量、买赠 =========

    /**
     * 起订量：顾客端每单至少购买的件数，为空或 0 表示不限制；门店收银不受限制
     */
    private Integer minBuyCount;
    /**
     * 买赠：每买多少件
     *
     * 和 {@link #giftCount} 一起使用，例如买 2 赠 1：giftBuyCount = 2，giftCount = 1；为空或 0 表示没有买赠
     */
    private Integer giftBuyCount;
    /**
     * 买赠：赠送多少件（赠送同一规格）
     */
    private Integer giftCount;
    /**
     * 买赠：赠品从哪里扣库存
     *
     * 枚举 {@link ProductSpuGiftStockSourceEnum}
     */
    private Integer giftStockSource;

    // ========== 营销相关字段 =========

    /**
     * 赠送积分
     */
    private Integer giveIntegral;

    // TODO @puhui999：字段估计要改成 brokerageType
    /**
     * 分销类型
     *
     * false - 默认
     * true - 自行设置
     */
    private Boolean subCommissionType;

    // ========== 统计相关字段 =========

    /**
     * 商品销量
     */
    private Integer salesCount;
    /**
     * 虚拟销量
     */
    private Integer virtualSalesCount;
    /**
     * 浏览量
     */
    private Integer browseCount;
}
