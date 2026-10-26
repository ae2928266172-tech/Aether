/**
 * 门店收银小票：按「小票设置」和收银单生成 HTML，用隐藏的 iframe 打印；收款成功语音播报
 *
 * 浏览器出于安全限制，打印时会弹出打印对话框。收银机上想“收款后直接出票”，请用 Chrome 的静默打印：
 * 在 Chrome 快捷方式的目标后面加上 --kiosk-printing，并把小票机设为默认打印机。
 */
import { fenToYuan } from '@/utils'
import { formatDate } from '@/utils/formatTime'
import type { PosOrderVO, PosReceiptConfigVO } from '@/api/mall/trade/pos'
import { PosPayTypeEnum } from '@/api/mall/trade/pos'

/** 医疗器械信息字段 */
export const DEVICE_FIELDS = [
  { value: 'registrationNo', label: '注册证号' },
  { value: 'productionLicenseNo', label: '生产许可证号' },
  { value: 'registrant', label: '注册人' },
  { value: 'productionAddress', label: '生产地址' }
]

/** 抬头、底部文字里可以使用的变量 */
export const RECEIPT_VARIABLES = [
  '{单号}',
  '{时间}',
  '{收银员}',
  '{件数}',
  '{商品金额}',
  '{优惠}',
  '{应收}',
  '{实收}',
  '{找零}',
  '{收款方式}'
]

export const payTypeLabel = (value?: number) =>
  Object.values(PosPayTypeEnum).find((t) => t.value === value)?.label || '其他'

/** 应收：兼容没有打折字段的老收银单 */
export const orderPayPrice = (order: PosOrderVO) => order.payPrice ?? order.totalPrice

const escapeHtml = (text?: string) =>
  (text || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** 把文字里的变量换成这张收银单的值 */
export const fillVariables = (text: string | undefined, order: PosOrderVO) => {
  const values: Record<string, string> = {
    '{单号}': order.no,
    '{时间}': formatDate(order.createTime as any),
    '{收银员}': order.cashierName || '',
    '{件数}': String(order.productCount ?? 0),
    '{商品金额}': fenToYuan(order.totalPrice),
    '{优惠}': fenToYuan(order.discountPrice || 0),
    '{应收}': fenToYuan(orderPayPrice(order)),
    '{实收}': fenToYuan(order.receivedPrice),
    '{找零}': fenToYuan(order.changePrice || 0),
    '{收款方式}': payTypeLabel(order.payType)
  }
  return (text || '').replace(/\{[^}]+\}/g, (key) => values[key] ?? key)
}

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => `<div>${escapeHtml(line) || '&nbsp;'}</div>`)
    .join('')

const row = (left: string, right: string, cls = '') =>
  `<div class="r-row ${cls}"><span>${left}</span><span>${right}</span></div>`

/** 小票正文 HTML（不含 <html>），设置页预览和打印共用 */
export const buildReceiptBody = (order: PosOrderVO, config: PosReceiptConfigVO, defaultTitle = '') => {
  const title = config.title || defaultTitle
  const html: string[] = []
  if (title) html.push(`<div class="r-title">${escapeHtml(title)}</div>`)
  if (config.headerText) html.push(`<div class="r-center r-sub">${lines(fillVariables(config.headerText, order))}</div>`)
  html.push('<div class="r-hr"></div>')
  html.push(`<div>单号：${escapeHtml(order.no)}</div>`)
  html.push(`<div>时间：${escapeHtml(formatDate(order.createTime as any))}</div>`)
  if (config.showCashier && order.cashierName) html.push(`<div>收银员：${escapeHtml(order.cashierName)}</div>`)
  html.push('<div class="r-hr"></div>')
  for (const item of order.items || []) {
    const name =
      escapeHtml(item.spuName) +
      (config.showSkuName && item.skuName && item.skuName !== item.spuName ? ` ${escapeHtml(item.skuName)}` : '')
    html.push(`<div class="r-item"><div class="r-name">${name}</div>`)
    const qty = config.showPrice ? `${fenToYuan(item.price)} × ${item.count}` : `× ${item.count}`
    html.push(row(qty, fenToYuan(item.totalPrice)))
    if (item.giftCount) html.push(row(`赠送 × ${item.giftCount}`, '0.00'))
    if (config.showDeviceInfo) {
      for (const field of DEVICE_FIELDS) {
        const value = (item as any)[field.value]
        if (value && config.deviceFields?.includes(field.value)) {
          html.push(`<div class="r-device">${field.label}：${escapeHtml(value)}</div>`)
        }
      }
    }
    html.push('</div>')
  }
  html.push('<div class="r-hr"></div>')
  html.push(row(`共 ${order.productCount} 件`, `商品金额 ${fenToYuan(order.totalPrice)}`))
  if (order.discountPrice) {
    const label = order.priceAdjusted ? '改价优惠' : order.discountRate ? `整单 ${order.discountRate / 10} 折` : '优惠'
    html.push(row(label, `-${fenToYuan(order.discountPrice)}`))
  }
  html.push(row('应收', `¥${fenToYuan(orderPayPrice(order))}`, 'r-total'))
  if (config.showPayment) {
    html.push(row(payTypeLabel(order.payType), fenToYuan(order.receivedPrice)))
    if (order.changePrice) html.push(row('找零', fenToYuan(order.changePrice)))
  }
  if (config.footerText) {
    html.push('<div class="r-hr"></div>')
    html.push(`<div class="r-center">${lines(fillVariables(config.footerText, order))}</div>`)
  }
  return html.join('')
}

/** 小票样式：热敏纸只有黑色，用等宽数字、虚线分隔 */
export const receiptStyle = (paperWidth: number) => `
  .receipt { width: ${paperWidth === 80 ? 72 : 48}mm; font-size: ${paperWidth === 80 ? 13 : 12}px; line-height: 1.5;
    color: #000; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; font-variant-numeric: tabular-nums; }
  .receipt .r-title { font-size: 1.35em; font-weight: 700; text-align: center; }
  .receipt .r-center { text-align: center; }
  .receipt .r-sub { font-size: 0.92em; }
  .receipt .r-hr { margin: 4px 0; border-top: 1px dashed #000; }
  .receipt .r-row { display: flex; justify-content: space-between; gap: 8px; }
  .receipt .r-item { margin-bottom: 3px; }
  .receipt .r-name { font-weight: 600; }
  .receipt .r-device { font-size: 0.85em; word-break: break-all; }
  .receipt .r-total { font-size: 1.2em; font-weight: 700; }
`

/** 打印小票：多份时分页打印 */
export const printReceipt = (order: PosOrderVO, config: PosReceiptConfigVO, defaultTitle = '') => {
  const copies = Math.max(1, Math.min(config.copies || 1, 3))
  const body = buildReceiptBody(order, config, defaultTitle)
  const pages = Array.from({ length: copies }, (_, i) =>
    `<div class="receipt"${i < copies - 1 ? ' style="page-break-after: always"' : ''}>${body}</div>`
  ).join('')
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument!
  doc.open()
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>小票 ${escapeHtml(order.no)}</title><style>` +
      `@page { size: ${config.paperWidth || 58}mm auto; margin: 2mm; } body { margin: 0; }` +
      receiptStyle(config.paperWidth || 58) +
      `</style></head><body>${pages}</body></html>`
  )
  doc.close()
  setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => iframe.remove(), 1000)
  }, 100)
}

/** 收款成功提示：先“叮”一声，再语音播报金额 */
export const announcePaid = (order: PosOrderVO, voice: boolean) => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new AudioCtx()
    const now = ctx.currentTime
    ;[880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.25, now + i * 0.15)
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.3)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + i * 0.15)
      osc.stop(now + i * 0.15 + 0.3)
    })
    setTimeout(() => ctx.close(), 1000)
  } catch {
    // 浏览器不支持声音时忽略
  }
  if (voice && 'speechSynthesis' in window) {
    const text = `收款成功，${fenToYuan(orderPayPrice(order))}元` +
      (order.changePrice ? `，找零${fenToYuan(order.changePrice)}元` : '')
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }
}
