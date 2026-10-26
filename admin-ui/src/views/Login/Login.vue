<template>
  <div
    :class="prefixCls"
    class="relative h-[100%] lt-md:px-10px lt-sm:px-10px lt-xl:px-10px lt-xl:px-10px"
  >
    <div class="relative mx-auto h-full flex">
      <div :class="`${prefixCls}__left flex-1 relative p-40px lt-xl:hidden overflow-hidden`">
        <!-- 左上角的 logo + 系统标题 -->
        <div class="relative z-1 flex items-center text-white">
          <img alt="" class="mr-12px h-44px w-44px rounded-12px" src="@/assets/imgs/logo.png" />
          <span class="text-22px font-bold tracking-wide">{{ appStore.getTitle }}</span>
        </div>
        <!-- 品牌标语 + 功能亮点 -->
        <div class="relative z-1 h-[calc(100%-60px)] flex flex-col justify-center pl-40px">
          <div class="text-40px font-bold leading-tight text-white">{{ slogan }}</div>
          <div class="mt-16px max-w-420px text-16px leading-relaxed text-white/80">
            顾客扫码下单，门店触屏收银，库存与供应商对账一处管理。
          </div>
          <div class="mt-48px flex flex-col gap-16px">
            <div v-for="item in features" :key="item.title" :class="`${prefixCls}__feature`">
              <div :class="`${prefixCls}__feature-icon`">
                <Icon :icon="item.icon" :size="22" />
              </div>
              <div>
                <div class="text-16px font-600 text-white">{{ item.title }}</div>
                <div class="mt-2px text-13px text-white/70">{{ item.desc }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        class="relative flex-1 p-30px dark:bg-[var(--login-bg-color)] lt-sm:p-10px overflow-x-hidden overflow-y-auto"
      >
        <!-- 右上角的主题、语言选择 -->
        <div
          class="flex items-center justify-between at-2xl:justify-end at-xl:justify-end"
          style="color: var(--el-text-color-primary)"
        >
          <div class="flex items-center at-2xl:hidden at-xl:hidden">
            <img alt="" class="mr-10px h-48px w-48px" src="@/assets/imgs/logo.png" />
            <span class="text-20px font-bold">{{ appStore.getTitle }}</span>
          </div>
          <div class="flex items-center justify-end space-x-10px h-48px">
            <ThemeSwitch />
          </div>
        </div>
        <!-- 右边的登录界面 -->
        <Transition appear enter-active-class="animate__animated animate__bounceInRight">
          <div
            class="m-auto h-[calc(100%-60px)] w-[100%] flex items-center at-2xl:max-w-500px at-lg:max-w-500px at-md:max-w-500px at-xl:max-w-500px"
          >
            <!-- 账号登录 -->
            <LoginForm class="m-auto h-auto p-20px lt-xl:(rounded-3xl light:bg-white)" />
            <!-- 手机登录 -->
            <MobileForm class="m-auto h-auto p-20px lt-xl:(rounded-3xl light:bg-white)" />
            <!-- 二维码登录 -->
            <QrCodeForm class="m-auto h-auto p-20px lt-xl:(rounded-3xl light:bg-white)" />
            <!-- 注册 -->
            <RegisterForm class="m-auto h-auto p-20px lt-xl:(rounded-3xl light:bg-white)" />
            <!-- 三方登录 -->
            <SSOLoginVue class="m-auto h-auto p-20px lt-xl:(rounded-3xl light:bg-white)" />
            <!-- 忘记密码 -->
            <ForgetPasswordForm class="m-auto h-auto p-20px lt-xl:(rounded-3xl light:bg-white)" />
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { useDesign } from '@/hooks/web/useDesign'
import { useAppStore } from '@/store/modules/app'
import { ThemeSwitch } from '@/layout/components/ThemeSwitch'

import {
  LoginForm,
  MobileForm,
  QrCodeForm,
  RegisterForm,
  SSOLoginVue,
  ForgetPasswordForm
} from './components'

defineOptions({ name: 'Login' })

const { t } = useI18n()
const appStore = useAppStore()
const { getPrefixCls } = useDesign()
const prefixCls = getPrefixCls('login')

const slogan = import.meta.env.VITE_APP_SLOGAN || '扫码下单 · 门店收银 · 进销存一体'
const features = [
  { icon: 'ep:iphone', title: '扫码下单，送到指定位置', desc: '每个区域一张二维码，顾客手机下单，工作人员配送' },
  { icon: 'ep:monitor', title: '门店触屏收银', desc: '大按钮点选、扫码枪、现金找零、小票打印' },
  { icon: 'ep:box', title: '进销存与对账', desc: '多规格共用库存、买赠、供应商月度对账' }
]
</script>

<style lang="scss" scoped>
$prefix-cls: #{$namespace}-login;

.#{$prefix-cls} {
  overflow: auto;

  &__left {
    background: linear-gradient(145deg, #0f766e 0%, #0d9488 45%, #14b8a6 100%);

    &::before,
    &::after {
      position: absolute;
      border-radius: 50%;
      content: '';
    }

    &::before {
      top: -160px;
      right: -120px;
      width: 480px;
      height: 480px;
      background: rgb(255 255 255 / 8%);
    }

    &::after {
      bottom: -200px;
      left: -140px;
      width: 520px;
      height: 520px;
      background: rgb(255 255 255 / 6%);
    }
  }

  &__feature {
    display: flex;
    max-width: 440px;
    padding: 14px 18px;
    background: rgb(255 255 255 / 10%);
    border: 1px solid rgb(255 255 255 / 16%);
    border-radius: 14px;
    backdrop-filter: blur(4px);
    align-items: center;
    gap: 14px;
  }

  &__feature-icon {
    display: flex;
    width: 42px;
    height: 42px;
    color: #fff;
    background: rgb(255 255 255 / 18%);
    border-radius: 12px;
    flex: none;
    align-items: center;
    justify-content: center;
  }
}
</style>

<style lang="scss">
.dark .login-form {
  .el-divider__text {
    background-color: var(--login-bg-color);
  }

  .el-card {
    background-color: var(--login-bg-color);
  }
}
</style>
