package cn.iocoder.yudao.module.trade.service.statistics.bo;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 商品销售明细的一行：线上订单项或门店收银单项
 *
 * @author Aether
 */
@Data
public class TradeProductSalesBO {

    /**
     * 来源：1 线上订单，2 门店收银
     */
    private Integer source;
    /**
     * 订单 / 收银单编号
     */
    private Long orderId;
    /**
     * 单号
     */
    private String orderNo;
    /**
     * 时间：线上订单为支付时间，门店收银为收银时间
     */
    private LocalDateTime time;
    /**
     * 商品 SPU 编号
     */
    private Long spuId;
    /**
     * 商品名字
     */
    private String spuName;
    /**
     * 商品 SKU 编号
     */
    private Long skuId;
    /**
     * 规格：线上订单为属性 JSON，门店收银为规格名字
     */
    private String skuText;
    /**
     * 件数
     */
    private Integer count;
    /**
     * 赠送件数
     */
    private Integer giftCount;
    /**
     * 金额，单位：分（分摊优惠后）
     */
    private Integer price;
    /**
     * 线上订单：配送地址（病区、床号）；门店收银：收银员
     */
    private String place;

}
