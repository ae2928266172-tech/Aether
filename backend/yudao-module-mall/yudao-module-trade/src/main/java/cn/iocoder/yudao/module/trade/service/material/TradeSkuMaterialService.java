package cn.iocoder.yudao.module.trade.service.material;

import cn.iocoder.yudao.module.trade.controller.admin.material.vo.TradeSkuMaterialSaveReqVO;
import cn.iocoder.yudao.module.trade.dal.dataobject.material.TradeSkuMaterialDO;
import cn.iocoder.yudao.module.trade.dal.dataobject.order.TradeOrderDO;
import cn.iocoder.yudao.module.trade.dal.dataobject.order.TradeOrderItemDO;
import jakarta.validation.Valid;

import java.util.Collection;
import java.util.List;

/**
 * 商品规格库存物料 Service 接口
 *
 * 负责“多规格 / 多名称商品共用同一库存物料”的配置、下单扣减和规格库存换算
 *
 * @author Aether
 */
public interface TradeSkuMaterialService {

    /**
     * 获得商品的规格物料配置
     *
     * @param spuId 商品 SPU 编号
     * @return 对应关系列表
     */
    List<TradeSkuMaterialDO> getSkuMaterialListBySpuId(Long spuId);

    /**
     * 保存商品的规格物料配置（整体覆盖），并重新换算规格库存
     *
     * @param saveReqVO 保存信息
     */
    void saveSkuMaterials(@Valid TradeSkuMaterialSaveReqVO saveReqVO);

    /**
     * 下单后，按规格物料配置扣减 ERP 库存
     *
     * @param order      订单
     * @param orderItems 订单项
     */
    void deductStockByOrder(TradeOrderDO order, List<TradeOrderItemDO> orderItems);

    /**
     * 取消订单（或订单项售后）后，退回已扣减的 ERP 库存
     *
     * @param order      订单
     * @param orderItems 订单项
     */
    void restoreStockByOrder(TradeOrderDO order, List<TradeOrderItemDO> orderItems);

    /**
     * 按物料库存重新换算规格库存：规格库存 = min(物料库存 / 每件扣减数量)，向下取整
     *
     * @param erpProductIds 发生变化的物料编号
     */
    void syncSkuStockByErpProductIds(Collection<Long> erpProductIds);

}
