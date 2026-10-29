北區學生一週聚會安排 — 設定與部署

將 weekly.html 放進新的 GitHub repository。
在 GitHub repository → Settings → Pages，選擇部署來源（例如 Deploy from a branch），選 main 分支及 /(root)，儲存。
編輯 weekly.html 底部設定： SUPABASE_URL：Supabase Project URL（不要加 /rest/v1/） SUPABASE_PUBLISHABLE_KEY：Settings → API Keys 裡的 Publishable key（sb_publishable_...） ADMIN_EMAIL：在 Supabase Auth 建立管理員帳戶時所用的電郵 ADMIN_USERNAME 已設為 admin
程式假設管理員 UID 是： ab786333-bad9-4e5b-af32-48300ea344fc 若這不是你 Supabase Auth 裡管理員的實際 UID，必須修改 HTML 中 ADMIN_UID。
前端絕不可放入 sb_secret_... 或 service_role key。只用 Publishable key。
此頁使用既有資料表 weekly_events、monthly_announcements；不會建立資料表。寫入權限必須由 Supabase RLS policies 限制至管理員 UID，不能只靠前端登入按鈕。
網站是獨立 GitHub Pages 專案，原有月曆檔案不需要修改。
若表格或政策的欄位名稱與程式不一致，頁面會顯示 Supabase 錯誤訊息。請先修正資料庫 schema/policies，勿將 Secret key 放到瀏覽器。
