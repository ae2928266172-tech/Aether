package cn.iocoder.yudao.module.trade.service.pos;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.trade.controller.admin.pos.vo.*;
import cn.iocoder.yudao.module.trade.dal.dataobject.pos.TradePosOrderDO;
import cn.iocoder.yudao.module.trade.dal.dataobject.pos.TradePosOrderItemDO;
import jakarta.validation.Valid;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

/**
 * 门店收银 Service 接口
 *
 * @author Aether
 */
public interface TradePosService {

    /**
     * 获得收银台的商品列表：所有上架商品，包括顾客端不可见的门店专售商品
     *
     * @return 商品列表
     */
    List<TradePosProductRespVO> getProductList();

    /**
     * 获得收银台的商品分类（大类、小类）
     *
     * @return 分类列表
     */
    List<TradePosCategoryRespVO> getCategoryList();

    /**
     * 收银下单：收款后立即完成，并扣减库存（含买赠的赠品）
     *
     * @param cashierId   收银员编号
     * @param cashierName 收银员名字
     * @param createReqVO 下单信息
     * @return 收银单
     */
    TradePosOrderDO createOrder(Long cashierId, String cashierName, @Valid TradePosOrderCreateReqVO createReqVO);

    /**
     * 作废收银单，并退回库存
     *
     * @param cancelReqVO 作废信息
     */
    void cancelOrder(@Valid TradePosOrderCancelReqVO cancelReqVO);

    /**
     * 获得收银单
     *
     * @param id 编号
     * @return 收银单
     */
    TradePosOrderDO getOrder(Long id);

    /**
     * 获得收银单分页
     *
     * @param pageReqVO 分页查询
     * @return 收银单分页
     */
    PageResult<TradePosOrderDO> getOrderPage(TradePosOrderPageReqVO pageReqVO);

    /**
     * 获得收银单项列表
     *
     * @param orderIds 收银单编号
     * @return 收银单项列表
     */
    List<TradePosOrderItemDO> getOrderItemListByOrderIds(Collection<Long> orderIds);

    /**
     * 收银汇总（交班对账）
     *
     * @param cashierId 收银员编号，为空时汇总所有收银员
     * @param beginTime 开始时间
     * @param endTime   结束时间
     * @return 汇总
     */
    TradePosSummaryRespVO getSummary(Long cashierId, LocalDateTime beginTime, LocalDateTime endTime);

}
