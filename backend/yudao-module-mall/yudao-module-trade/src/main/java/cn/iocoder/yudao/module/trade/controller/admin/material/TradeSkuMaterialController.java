package cn.iocoder.yudao.module.trade.controller.admin.material;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.module.erp.controller.admin.product.vo.product.ErpProductRespVO;
import cn.iocoder.yudao.module.erp.dal.dataobject.stock.ErpStockDO;
import cn.iocoder.yudao.module.erp.dal.dataobject.stock.ErpWarehouseDO;
import cn.iocoder.yudao.module.erp.service.product.ErpProductService;
import cn.iocoder.yudao.module.erp.service.stock.ErpStockService;
import cn.iocoder.yudao.module.erp.service.stock.ErpWarehouseService;
import cn.iocoder.yudao.module.trade.controller.admin.material.vo.TradeSkuMaterialRespVO;
import cn.iocoder.yudao.module.trade.controller.admin.material.vo.TradeSkuMaterialSaveReqVO;
import cn.iocoder.yudao.module.trade.dal.dataobject.material.TradeSkuMaterialDO;
import cn.iocoder.yudao.module.trade.service.material.TradeSkuMaterialService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.common.util.collection.CollectionUtils.convertList;
import static cn.iocoder.yudao.framework.common.util.collection.CollectionUtils.convertSet;

@Tag(name = "管理后台 - 商品规格库存物料")
@RestController
@RequestMapping("/trade/sku-material")
@Validated
public class TradeSkuMaterialController {

    @Resource
    private TradeSkuMaterialService skuMaterialService;

    @Resource
    private ErpProductService erpProductService;
    @Resource
    private ErpWarehouseService erpWarehouseService;
    @Resource
    private ErpStockService erpStockService;

    @GetMapping("/list-by-spu-id")
    @Operation(summary = "获得商品的规格物料配置")
    @Parameter(name = "spuId", description = "商品 SPU 编号", required = true, example = "1024")
    @PreAuthorize("@ss.hasPermission('trade:sku-material:query')")
    public CommonResult<List<TradeSkuMaterialRespVO>> getSkuMaterialList(@RequestParam("spuId") Long spuId) {
        List<TradeSkuMaterialDO> list = skuMaterialService.getSkuMaterialListBySpuId(spuId);
        Map<Long, ErpProductRespVO> productMap = erpProductService.getProductVOMap(
                convertSet(list, TradeSkuMaterialDO::getErpProductId));
        ErpWarehouseDO warehouse = erpWarehouseService.getDefaultWarehouse();
        return success(convertList(list, material -> {
            TradeSkuMaterialRespVO respVO = new TradeSkuMaterialRespVO().setSkuId(material.getSkuId())
                    .setErpProductId(material.getErpProductId()).setQuantity(material.getQuantity());
            ErpProductRespVO product = productMap.get(material.getErpProductId());
            if (product != null) {
                respVO.setErpProductName(product.getName()).setErpProductUnitName(product.getUnitName());
            }
            if (warehouse != null) {
                ErpStockDO stock = erpStockService.getStock(material.getErpProductId(), warehouse.getId());
                respVO.setStockCount(stock != null ? stock.getCount() : null);
            }
            return respVO;
        }));
    }

    @PutMapping("/save")
    @Operation(summary = "保存商品的规格物料配置")
    @PreAuthorize("@ss.hasPermission('trade:sku-material:update')")
    public CommonResult<Boolean> saveSkuMaterials(@Valid @RequestBody TradeSkuMaterialSaveReqVO saveReqVO) {
        skuMaterialService.saveSkuMaterials(saveReqVO);
        return success(true);
    }

}
