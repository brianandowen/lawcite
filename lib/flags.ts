// 展示範圍開關：NEXT_PUBLIC_SHOW_EXTRAS=1 時開啟會員（登入／紀錄）與社會脈動等次要入口。
// 預設關閉。修改後需重新 build / redeploy（NEXT_PUBLIC_* 於建置時內嵌）。
export const SHOW_EXTRAS = process.env.NEXT_PUBLIC_SHOW_EXTRAS === '1';
