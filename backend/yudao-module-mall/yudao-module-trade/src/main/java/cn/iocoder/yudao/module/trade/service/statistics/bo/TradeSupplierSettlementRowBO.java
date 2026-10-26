package cn.iocoder.yudao.module.trade.service.statistics.bo;

import lombok.Data;

/**
 * 供应商对账统计行 BO：按供应商 + 商品汇总的销售数据
 *
 * @author Aether
 */
@Data
public class TradeSupplierSettlementRowBO {

    /**
     * 供应商编号，为空表示商品未设置供应商
     */
    private Long supplierId;
    /**
     * 商品 SPU 编号
     */
    private Long spuId;
    /**
     * 商品名字
     */
    private String spuName;
    /**
     * 销售件数
     */
    private Integer count;
    /**
     * 赠送件数
     */
    private Integer giftCount;
    /**
     * 销售金额，单位：分
     */
    private Integer totalPrice;
    /**
     * 销售成本（成本价 × 销售件数），单位：分
     */
    private Integer costPrice;
    /**
     * 赠品成本（成本价 × 赠送件数），单位：分
     */
    private Integer giftCostPrice;

}
