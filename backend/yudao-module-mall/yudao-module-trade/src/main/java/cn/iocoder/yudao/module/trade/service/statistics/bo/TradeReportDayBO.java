package cn.iocoder.yudao.module.trade.service.statistics.bo;

import lombok.Data;

import java.time.LocalDate;

/**
 * 营收报表：某一天、某个来源（线上订单 / 门店收银）的汇总
 *
 * @author Aether
 */
@Data
public class TradeReportDayBO {

    /**
     * 日期
     */
    private LocalDate day;
    /**
     * 单数
     */
    private Integer orderCount;
    /**
     * 实收金额，单位：分。线上订单扣除已退款金额，门店收银为打折、改价后的应收
     */
    private Integer price;
    /**
     * 优惠金额，单位：分
     */
    private Integer discountPrice;
    /**
     * 商品件数（不含赠品）
     */
    private Integer productCount;
    /**
     * 赠送件数
     */
    private Integer giftCount;
    /**
     * 成本，单位：分。成本价 ×（件数 + 赠送件数）
     */
    private Integer costPrice;

}
