/**
 * 檢查 firebase-service-account.json 是否正確設定
 * 執行: node scripts/check-firebase-credentials.js
 */
const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '..', 'firebase-service-account.json');

if (!fs.existsSync(jsonPath)) {
  console.error('❌ 找不到 firebase-service-account.json');
  process.exit(1);
}

try {
  const content = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(content);
  
  if (!data.private_key || !data.client_email) {
    console.error('❌ JSON 缺少 private_key 或 client_email');
    process.exit(1);
  }

  const key = data.private_key;
  const isValidPEM = key.includes('-----BEGIN PRIVATE KEY-----') 
    && key.includes('-----END PRIVATE KEY-----')
    && key.length > 200
    && !key.includes('請貼上')
    && !key.includes('取代此檔案');

  if (!isValidPEM) {
    console.error('❌ 私密金鑰格式錯誤。請用您從 Google Cloud 下載的完整 JSON 檔案內容取代 firebase-service-account.json');
    console.error('   下載位置: Google Cloud Console → 服務帳戶 → 金鑰 → 新增金鑰 → JSON');
    process.exit(1);
  }

  console.log('✅ firebase-service-account.json 格式正確');
  console.log('   client_email:', data.client_email);
} catch (err) {
  console.error('❌ 讀取或解析失敗:', err.message);
  process.exit(1);
}
