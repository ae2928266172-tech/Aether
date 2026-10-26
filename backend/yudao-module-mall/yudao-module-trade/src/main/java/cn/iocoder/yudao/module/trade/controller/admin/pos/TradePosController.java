package cn.iocoder.yudao.module.trade.controller.admin.pos;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.framework.security.core.service.SecurityFrameworkService;
import cn.iocoder.yudao.module.product.api.spu.ProductSpuApi;
import cn.iocoder.yudao.module.product.api.spu.dto.ProductSpuRespDTO;
import cn.iocoder.yudao.module.trade.controller.admin.pos.vo.*;
import cn.iocoder.yudao.module.trade.dal.dataobject.pos.TradePosOrderDO;
import cn.iocoder.yudao.module.trade.dal.dataobject.pos.TradePosOrderItemDO;
import cn.iocoder.yudao.module.trade.dal.dataobject.config.TradePosReceiptConfig;
import cn.iocoder.yudao.module.trade.service.config.TradeConfigService;
import cn.iocoder.yudao.module.trade.service.pos.TradePosService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.common.util.collection.CollectionUtils.convertMultiMap;
import static cn.iocoder.yudao.framework.common.util.collection.CollectionUtils.convertSet;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserNickname;
import static cn.iocoder.yudao.module.trade.enums.ErrorCodeConstants.POS_ORDER_ADJUST_PRICE_NO_PERMISSION;
import static cn.iocoder.yudao.module.trade.enums.ErrorCodeConstants.POS_ORDER_DISCOUNT_NO_PERMISSION;

@Tag(name = "管理后台 - 门店收银")
@RestController
@RequestMapping("/trade/pos")
@Validated
public class TradePosController {

    @Resource
    private TradePosService posService;
    @Resource
    private TradeConfigService tradeConfigService;
    @Resource
    private ProductSpuApi productSpuApi;
    @Resource
    private SecurityFrameworkService securityFrameworkService;

    @GetMapping("/product-list")
    @Operation(summary = "获得收银台商品列表")
    @PreAuthorize("@ss.hasPermission('trade:pos:create')")
    public CommonResult<List<TradePosProductRespVO>> getProductList() {
        return success(posService.getProductList());
    }

    @GetMapping("/category-list")
    @Operation(summary = "获得收银台商品分类")
    @PreAuthorize("@ss.hasPermission('trade:pos:create')")
    public CommonResult<List<TradePosCategoryRespVO>> getCategoryList() {
        return success(posService.getCategoryList());
    }

    @PostMapping("/create")
    @Operation(summary = "收银下单")
    @PreAuthorize("@ss.hasPermission('trade:pos:create')")
    public CommonResult<TradePosOrderRespVO> createOrder(@Valid @RequestBody TradePosOrderCreateReqVO createReqVO) {
        // 打折、改价分别需要单独的权限，后台在「角色管理」里按需分配
        if (createReqVO.getDiscountRate() != null && !securityFrameworkService.hasPermission("trade:pos:discount")) {
            throw exception(POS_ORDER_DISCOUNT_NO_PERMISSION);
        }
        if (createReqVO.getPayPrice() != null && !securityFrameworkService.hasPermission("trade:pos:update-price")) {
            throw exception(POS_ORDER_ADJUST_PRICE_NO_PERMISSION);
        }
        TradePosOrderDO order = posService.createOrder(getLoginUserId(), getLoginUserNickname(), createReqVO);
        return success(buildOrderDetail(order));
    }

    @PutMapping("/cancel")
    @Operation(summary = "作废收银单")
    @PreAuthorize("@ss.hasPermission('trade:pos:cancel')")
    public CommonResult<Boolean> cancelOrder(@Valid @RequestBody TradePosOrderCancelReqVO cancelReqVO) {
        posService.cancelOrder(cancelReqVO);
        return success(true);
    }

    @GetMapping("/get")
    @Operation(summary = "获得收银单")
    @Parameter(name = "id", description = "编号", required = true, example = "1")
    @PreAuthorize("@ss.hasPermission('trade:pos:query')")
    public CommonResult<TradePosOrderRespVO> getOrder(@RequestParam("id") Long id) {
        TradePosOrderDO order = posService.getOrder(id);
        return success(order != null ? buildOrderDetail(order) : null);
    }

    @GetMapping("/page")
    @Operation(summary = "获得收银单分页")
    @PreAuthorize("@ss.hasPermission('trade:pos:query')")
    public CommonResult<PageResult<TradePosOrderRespVO>> getOrderPage(@Valid TradePosOrderPageReqVO pageReqVO) {
        PageResult<TradePosOrderDO> pageResult = posService.getOrderPage(pageReqVO);
        Map<Long, List<TradePosOrderItemDO>> itemMap = convertMultiMap(
                posService.getOrderItemListByOrderIds(convertSet(pageResult.getList(), TradePosOrderDO::getId)),
                TradePosOrderItemDO::getOrderId);
        return success(BeanUtils.toBean(pageResult, TradePosOrderRespVO.class, order -> order.setItems(
                BeanUtils.toBean(itemMap.getOrDefault(order.getId(), Collections.emptyList()), TradePosOrderRespVO.Item.class))));
    }

    @GetMapping("/summary")
    @Operation(summary = "收银汇总（交班对账），默认今天、当前收银员")
    @Parameter(name = "date", description = "日期，默认今天", example = "2026-10-26")
    @Parameter(name = "all", description = "是否汇总所有收银员", example = "false")
    @PreAuthorize("@ss.hasPermission('trade:pos:query')")
    public CommonResult<TradePosSummaryRespVO> getSummary(
            @RequestParam(value = "date", required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate date,
            @RequestParam(value = "all", required = false, defaultValue = "false") Boolean all) {
        LocalDate day = date != null ? date : LocalDate.now();
        return success(posService.getSummary(Boolean.TRUE.equals(all) ? null : getLoginUserId(),
                LocalDateTime.of(day, LocalTime.MIN), LocalDateTime.of(day, LocalTime.MAX)));
    }

    /**
     * 收银单详情，商品项带上医疗器械信息（取商品当前设置），用于打印、补打小票
     */
    @GetMapping("/receipt-config")
    @Operation(summary = "获得小票设置")
    @PreAuthorize("@ss.hasAnyPermissions('trade:pos:create', 'trade:pos:query', 'trade:pos:receipt-config')")
    public CommonResult<TradePosReceiptConfig> getReceiptConfig() {
        return success(tradeConfigService.getPosReceiptConfig());
    }

    @PutMapping("/receipt-config")
    @Operation(summary = "保存小票设置")
    @PreAuthorize("@ss.hasPermission('trade:pos:receipt-config')")
    public CommonResult<Boolean> saveReceiptConfig(@Valid @RequestBody TradePosReceiptConfig config) {
        tradeConfigService.savePosReceiptConfig(config);
        return success(true);
    }

    private TradePosOrderRespVO buildOrderDetail(TradePosOrderDO order) {
        List<TradePosOrderItemDO> items = posService.getOrderItemListByOrderIds(Collections.singleton(order.getId()));
        Map<Long, ProductSpuRespDTO> spuMap = productSpuApi.getSpuMap(convertSet(items, TradePosOrderItemDO::getSpuId));
        return BeanUtils.toBean(order, TradePosOrderRespVO.class)
                .setItems(BeanUtils.toBean(items, TradePosOrderRespVO.Item.class, item -> {
                    ProductSpuRespDTO spu = spuMap.get(item.getSpuId());
                    if (spu != null) {
                        item.setRegistrationNo(spu.getRegistrationNo()).setProductionLicenseNo(spu.getProductionLicenseNo())
                                .setRegistrant(spu.getRegistrant()).setProductionAddress(spu.getProductionAddress());
                    }
                }));
    }

}
