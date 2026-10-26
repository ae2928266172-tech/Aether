package cn.iocoder.yudao.module.trade.dal.dataobject.pos;

import cn.iocoder.yudao.framework.mybatis.core.dataobject.BaseDO;
import cn.iocoder.yudao.module.trade.enums.pos.TradePosOrderStatusEnum;
import cn.iocoder.yudao.module.trade.enums.pos.TradePosPayTypeEnum;
import com.baomidou.mybatisplus.annotation.KeySequence;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 门店收银单 DO
 *
 * 门店收银台（触屏）现场收款的单据：收款后立即完成，扣减库存；当天收错了可以作废，作废后退回库存
 *
 * @author Aether
 */
@TableName("trade_pos_order")
@KeySequence("trade_pos_order_seq") // 用于 Oracle、PostgreSQL、Kingbase、DB2、H2 数据库的主键自增。如果是 MySQL 等数据库，可不写。
@Data
@EqualsAndHashCode(callSuper = true)
@ToString(callSuper = true)
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TradePosOrderDO extends BaseDO {

    /**
     * 编号
     */
    @TableId
    private Long id;
    /**
     * 收银单号
     */
    private String no;
    /**
     * 状态
     *
     * 枚举 {@link TradePosOrderStatusEnum}
     */
    private Integer status;
    /**
     * 商品件数（不含赠品）
     */
    private Integer productCount;
    /**
     * 应收金额，单位：分
     */
    private Integer totalPrice;
    /**
     * 收款方式
     *
     * 枚举 {@link TradePosPayTypeEnum}
     */
    private Integer payType;
    /**
     * 实收金额，单位：分。现金收款时为顾客给的金额，其它方式等于应收金额
     */
    private Integer receivedPrice;
    /**
     * 找零金额，单位：分
     */
    private Integer changePrice;
    /**
     * 收银员编号
     *
     * 关联 AdminUserDO 的 id 编号
     */
    private Long cashierId;
    /**
     * 收银员名字
     */
    private String cashierName;
    /**
     * 备注
     */
    private String remark;
    /**
     * 作废时间
     */
    private LocalDateTime cancelTime;
    /**
     * 作废原因
     */
    private String cancelReason;

}
