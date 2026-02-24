# Firebase Admin 設定（新增產品功能所需）

新增產品透過 API 路由處理，需設定 Firebase Admin SDK。

## 設定步驟（使用 JSON 檔案，最簡單）

1. **開啟您下載的服務帳戶 JSON 檔案**（從 Google Cloud 服務帳戶產生的金鑰）

2. **全選複製**（Ctrl+A → Ctrl+C）整個 JSON 內容

3. **開啟專案中的 `firebase-service-account.json`**

4. **全選貼上**（Ctrl+A → Ctrl+V）取代檔案內容，然後儲存

5. **重啟開發伺服器**：
   ```bash
   npm run dev
   ```

完成後，新增產品功能應可正常儲存。

---

**注意**：`firebase-service-account.json` 已加入 `.gitignore`，不會被提交到版控。
