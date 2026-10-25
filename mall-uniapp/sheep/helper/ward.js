// 病区：病人扫病区二维码进入后记住所在病区，下单时自动选择【病房配送】
const WARD_KEY = 'ward';

/** 获得当前病区，没有时返回 null */
export function getWard() {
  return uni.getStorageSync(WARD_KEY) || null;
}

/** 记住当前病区 */
export function setWard(ward) {
  uni.setStorageSync(WARD_KEY, ward);
}

/** 清除当前病区（病区停用时） */
export function removeWard() {
  uni.removeStorageSync(WARD_KEY);
}
