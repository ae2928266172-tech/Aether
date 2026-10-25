<!-- 病区二维码：病人扫码进入小程序，自动带上病区 -->
<template>
  <Dialog :title="`${ward?.name ?? ''} - 下单二维码`" v-model="dialogVisible" width="640px">
    <el-row :gutter="20" v-loading="loading">
      <el-col :span="12" class="text-center">
        <div class="mb-10px font-bold">微信小程序码（推荐）</div>
        <el-image v-if="wxaQrcode" :src="wxaQrcode" class="h-240px w-240px" />
        <el-empty v-else :image-size="120" description="未生成">
          <template #description>
            <div class="text-12px text-gray-500">
              需要先在【系统管理 - 三方登录 - 三方应用】配置会员端的微信小程序，并发布上线
            </div>
          </template>
        </el-empty>
        <el-button v-if="wxaQrcode" class="mt-10px" @click="download(wxaQrcode, '小程序码')">
          下载
        </el-button>
      </el-col>
      <el-col :span="12" class="text-center">
        <div class="mb-10px font-bold">H5 网页二维码（备用）</div>
        <Qrcode :text="h5Url" :width="240" tag="img" @done="(url) => (h5Qrcode = url)" />
        <div class="break-all text-12px text-gray-500">{{ h5Url }}</div>
        <el-button class="mt-10px" @click="download(h5Qrcode, 'H5二维码')">下载</el-button>
      </el-col>
    </el-row>
    <el-alert
      class="mt-20px"
      type="info"
      :closable="false"
      title="打印后贴在病区（例如：护士站、病房门口），病人扫码即进入下单页并自动带上病区；下单时必须填写床号。"
    />
  </Dialog>
</template>
<script setup lang="ts">
import { DeliveryWardApi, DeliveryWardVO } from '@/api/mall/trade/delivery/ward'

/** 病区二维码 */
defineOptions({ name: 'DeliveryWardQrcode' })

const dialogVisible = ref(false) // 弹窗的是否展示
const loading = ref(false) // 小程序码的加载中
const ward = ref<DeliveryWardVO>() // 当前病区
const wxaQrcode = ref('') // 小程序码（Base64）
const h5Qrcode = ref('') // H5 二维码（Base64），用于下载

/** H5 下单地址：和小程序码一样，打开首页并带上病区编号 */
const h5Url = computed(
  () => `${import.meta.env.VITE_MALL_H5_DOMAIN}/pages/index/index?wardId=${ward.value?.id ?? ''}`
)

/** 打开弹窗 */
const open = async (row: DeliveryWardVO) => {
  dialogVisible.value = true
  ward.value = row
  wxaQrcode.value = ''
  loading.value = true
  try {
    wxaQrcode.value = await DeliveryWardApi.getWardWxaQrcode(row.id!)
  } catch {
    // 未配置小程序时会失败，此时使用 H5 二维码
  } finally {
    loading.value = false
  }
}
defineExpose({ open }) // 提供 open 方法，用于打开弹窗

/** 下载图片 */
const download = (dataUrl: string, suffix: string) => {
  if (!dataUrl) {
    return
  }
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `${ward.value?.name}-${suffix}.png`
  link.click()
}
</script>
