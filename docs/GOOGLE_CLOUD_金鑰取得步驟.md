# Google Cloud 服務帳戶金鑰取得步驟（詳細版）

## 方式一：從 Firebase Console 進入（推薦）

### 步驟 1：開啟 Firebase 專案設定
1. 前往 [Firebase Console](https://console.firebase.google.com)
2. 點擊左側選單**最上方**的 **齒輪圖示**（專案設定）
3. 在設定頁面中，點擊上方的 **「服務帳戶」** 分頁

### 步驟 2：進入 Google Cloud
1. 在「Firebase Admin SDK」區塊中，點擊 **「管理服務帳戶權限」** 連結
2. 會自動跳轉到 Google Cloud Console 的 IAM 頁面

### 步驟 3：前往服務帳戶
1. 點擊左側選單的 **「☰」**（漢堡選單）
2. 選擇 **「IAM 與管理」** → **「服務帳戶」**
3. 或直接前往：<https://console.cloud.google.com/iam-admin/serviceaccounts?project=vkang-erp>

### 步驟 4：選擇 Firebase Admin 帳戶
1. 在服務帳戶列表中，找到 **`firebase-adminsdk-fbsvc@vkang-erp.iam.gserviceaccount.com`**
2. 點擊該列的 **電子郵件**（整行可點擊）

### 步驟 5：建立金鑰
1. 進入該服務帳戶的詳細頁面後，點擊上方的 **「金鑰」** 分頁
2. 點擊 **「新增金鑰」** 按鈕
3. 選擇 **「建立新金鑰」**
4. 選擇 **「JSON」** 格式
5. 點擊 **「建立」**
6. 瀏覽器會自動下載一個 JSON 檔案（檔名類似 `vkang-erp-xxxxx.json`）

### 步驟 6：複製到專案
1. 用文字編輯器開啟下載的 JSON 檔案
2. 全選（Ctrl+A）→ 複製（Ctrl+C）
3. 開啟專案中的 `firebase-service-account.json`
4. 全選（Ctrl+A）→ 貼上（Ctrl+V）→ 儲存（Ctrl+S）

---

## 方式二：直接從 Google Cloud Console 進入

### 步驟 1：開啟服務帳戶頁面
1. 前往：<https://console.cloud.google.com/iam-admin/serviceaccounts?project=vkang-erp>
2. 若未登入，請使用您的 Google 帳號登入

### 步驟 2：確認專案
1. 確認左上角專案選擇器顯示 **「vkang-erp」**
2. 若否，點擊專案名稱，選擇 vkang-erp

### 步驟 3～6：同方式一的步驟 4～6

---

## 路徑總覽

```
Firebase Console
  └─ 齒輪（專案設定）
      └─ 服務帳戶 分頁
          └─ 管理服務帳戶權限
              └─ Google Cloud Console
                  └─ IAM 與管理 → 服務帳戶
                      └─ 點擊 firebase-adminsdk-fbsvc@...
                          └─ 金鑰 分頁
                              └─ 新增金鑰 → 建立新金鑰 → JSON → 建立
```

---

## 常見問題

**Q：找不到「服務帳戶」分頁？**  
A：請確認您點擊的是 Firebase 專案設定（齒輪），不是其他頁面的設定。

**Q：沒有「新增金鑰」按鈕？**  
A：請確認您已點擊進入某個服務帳戶的詳細頁面，金鑰按鈕在該頁面的「金鑰」分頁中。

**Q：下載的 JSON 檔案在哪？**  
A：通常在「下載」資料夾，檔名類似 `vkang-erp-12345-abcdef.json`。
