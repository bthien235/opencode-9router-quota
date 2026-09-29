# Bảo trì plugin khi OpenCode hoặc 9Router cập nhật

Tài liệu này dành cho người tiếp nhận plugin tại `D:\UtilityTools\checkquota9router`. Mục tiêu là **kiểm tra thay đổi, sửa đúng chỗ, kiểm thử rồi mới triển khai**; không thể bảo đảm tương thích chỉ bằng việc nâng version hoặc chép file mới. UI của plugin giữ nhãn tiếng Anh ngắn gọn; tài liệu dành cho người bảo trì viết bằng tiếng Việt.

## 1. Nguyên tắc an toàn

1. Ghi lại version OpenCode, 9Router trước/sau, ngày cập nhật và hành vi bị lỗi. Lưu ảnh màn hình và log đã **xóa API key, cookie, token, email**.
2. Chỉ sửa mã trong `src/` trước. Không sửa trực tiếp bản cài tại `%USERPROFILE%\.config\opencode\plugins\9router-quota\` rồi quên cập nhật mã nguồn.
3. Trước khi ghi đè bản cài, sao lưu **ba file mã** `index.ts`, `tui.tsx`, `quota.ts` vào thư mục riêng. Không xóa hoặc sao chép công khai `opencode.json` hay dữ liệu plugin: chúng có thể chứa key và mật khẩu.
4. Giữ UTF-8 và CRLF khi sửa các file TypeScript hiện có. Không gửi nguyên response `/api/providers/client`, log đăng nhập hoặc cấu hình lên issue công khai.
5. Mỗi thay đổi API/alias mới phải có fixture JSON **giả lập hoặc đã ẩn danh** và test tương ứng. Không đoán phần trăm nếu 9Router không trả tỷ lệ có thể tính được.

## 2. Xác định bản nào đã đổi

Tại PowerShell trong thư mục dự án:

```powershell
opencode --version
opencode plugin list
npm list @opencode/plugin --depth=0
npm run
bun test src/quota.test.ts
.\node_modules\.bin\tsc --noEmit -p tsconfig.json
```

Ghi version/commit 9Router trong dashboard hoặc bản cài 9Router thực tế (không coi nhánh `master` trên GitHub là version đang chạy). Đối chiếu changelog/release của **đúng hai version**. Nếu có checkout riêng của từng repo, dùng `git log --oneline <old>..<new>` và `git diff <old>..<new> -- <đường-dẫn-liên-quan>` trong checkout đó. Nếu không có checkout, xem phần `Files changed` trên GitHub giữa hai tag/commit. Không chạy lệnh `git reset`, không thay cấu hình/key của người dùng để thử lỗi.

Nguồn cần đọc:

- OpenCode v2: [plugin server](https://opencode.ai/v2/docs/build/plugins), [plugin CLI/TUI](https://opencode.ai/v2/docs/build/plugins/cli), [CLI](https://opencode.ai/v2/docs/cli). **Chỉ dùng tài liệu v2** để xác nhận API v2; không dựa vào tài liệu v1 hay schema cấu hình v1.
- 9Router: [repo và release](https://github.com/decolua/9router), [lịch sử thay đổi](https://github.com/decolua/9router/commits/master/). Đọc mã ở **tag/commit tương ứng bản đang chạy**, không mặc định lấy bản `master` mới nhất.

## 3. Bản đồ điểm tích hợp cần so sánh

| Thành phần | File plugin | Mã/tài liệu upstream phải đối chiếu | Cần xác nhận |
| --- | --- | --- | --- |
| Provider/model | `src/index.ts` | OpenCode v2 `provider.transform`, `provider.reload`, `Model.Info`, `Provider.Info`, storage | Provider thêm/cập nhật/xóa và model thực sự xuất hiện/biến mất, không đăng ký transform lặp. |
| Lệnh và sidebar | `src/tui.tsx` | OpenCode v2 CLI plugin: `ui.slot`, `keymap.layer`, `ui.model.current`, `storage.store`/`storage.memory` | Slot còn mount được; chuyển session giữ trạng thái mở và không fetch quota đã cache. |
| Danh sách tài khoản | `src/tui.tsx` | 9Router `src/app/api/providers/client/route.js`, `src/shared/constants/providers.js` | Phân trang/`pageSize`, auth, `accountStatus=active`, `isActive`, `id`, `provider`; tài khoản tắt không hiện. |
| Quota | `src/tui.tsx`, `src/quota.ts` | 9Router `src/app/api/usage/[connectionId]/route.js`, `open-sse/services/usage.js`, từng handler trong `open-sse/services/usage/` | `quotas`/`remainingPercentage`/`remaining`/`used`/`total`/`unlimited`, lỗi auth; không hiển thị quota provider sai. |
| Alias model | `src/quota.ts` | 9Router `open-sse/providers/registry/*.js`, `open-sse/config/providerModels.js` | `uiAlias`/`alias` → **ID provider thật** (`cmc` → `commandcode`), chỉ thêm alias chắc chắn. |
| Dashboard login | `src/tui.tsx` | 9Router `src/app/api/auth/login/route.js`, cấu hình auth ở bản đang chạy | Cookie/token/401 còn hoạt động; không log mật khẩu hoặc token. |

**Lưu ý:** API `/v1/models` để khám phá model và `/api/usage/[connectionId]` để đọc quota là hai luồng khác nhau. Có model không có nghĩa 9Router hỗ trợ quota cho provider đó. Lấy danh sách provider hỗ trợ quota từ cờ `features.usage` trong registry của phiên bản tương ứng; không gán quota của provider khác theo tên model gần giống.

## 4. Cách sửa theo triệu chứng

1. **Plugin không tải, sidebar mất/lỗi render:** đọc log OpenCode đã ẩn dữ liệu nhạy cảm; so lại import của bản cài, API slot/keymap/storage với tài liệu OpenCode v2. Bản mã nguồn dùng `@opencode/plugin`; bản cài local hiện dùng `@opencode-ai/plugin` và `@opencode-ai/ai/providers/`. Đừng đồng bộ nguyên file nguồn lên bản cài mà bỏ qua chuyển đổi import; xác nhận cách import thực tế bằng bản OpenCode đang chạy.
2. **Đổi session bị đóng hoặc gọi API nhiều:** kiểm tra `nine-quota-panel` (trạng thái mở), `nine-quota-cache` (theo dashboard URL + provider + model), `quotaAutoRefresh` (mặc định tắt), lệnh `Refresh ↻`; kiểm tra trên hai session cùng model và hai model khác nhau. `storage.memory` chỉ sống trong phiên TUI, không tồn tại sau khi thoát chương trình.
3. **Model không hiện sau `/connect`:** xem kết quả `GET /models`, `custom-providers` trong plugin storage, transform và poll server 30 giây. Kiểm tra lại bằng lệnh liệt kê model/TUI; đừng coi `opencode plugin list` là bằng chứng model đã đồng bộ.
4. **Quên account hoặc lẫn provider:** xác nhận alias model trong registry, response `/api/providers/client` (chỉ kiểm tra các trường không nhạy cảm), trạng thái `isActive`, và điều kiện lọc trong `activeForProvider`. Với response phân trang, kiểm tra toàn bộ trang thay vì chỉ trang đầu nếu API đã đổi.
5. **`No quota` / `Unavailable` hoặc thanh lệch:** so một response `/api/usage/[id]` **đã ẩn danh** với `quotaWindows`; thêm fixture vào `src/quota.test.ts`. Chỉ sửa nhãn có nghĩa tương đương rõ ràng. `quotaLabelWidth`/`quotaRow` căn thanh chung theo nhóm provider. Nếu upstream trả `message` do thiếu quyền hoặc quota không hỗ trợ, hiển thị trạng thái thay vì bịa phần trăm.
6. **401/offline:** kiểm tra URL và phiên đăng nhập dashboard bằng trình duyệt trước, sau đó kiểm tra luồng login TUI; phân biệt lỗi auth dashboard với API key dùng cho `/v1/models`. Không đưa password/key vào lệnh shell, URL hoặc log.

## 5. Kiểm thử trước khi cài

```powershell
npm install
.\node_modules\.bin\tsc --noEmit -p tsconfig.json
bun test src/quota.test.ts
```

Sau đó thử thủ công trong TUI bằng **tài khoản/provider thử nghiệm**:

- Mở `Quota`, chuyển qua lại hai session dùng cùng model: cây giữ trạng thái, không fetch lại khi auto tắt. Đổi sang model chưa cache: fetch một lần; quay lại model cũ: hiện cache.
- Bấm `Refresh ↻`: fetch lại đúng provider; bật `[x] Auto 60s`: tự làm mới sau khoảng 60 giây; tắt lại: không còn poll quota định kỳ. Xác minh bằng log mạng nếu có, không chỉ nhìn thời gian trên giao diện.
- Thử Codex (`5h`/`7d`), Command Code (`Credits`/`5h`/`7d`) và ít nhất một provider khác có usage. So giá trị với dashboard; các thanh trong cùng provider phải thẳng cột.
- Tắt một account trên 9Router rồi refresh: account biến mất. Chọn model provider không hỗ trợ quota: không hiện quota của provider khác.
- Thử `/connect`, `/reconnect`, `/connections` với provider thử nghiệm; key cũ phải được giữ nếu phát hiện model thất bại. Xóa provider global chỉ sau khi đã xác nhận có backup.

TypeScript và unit test **không thay thế được** kiểm thử TUI và API 9Router thật. Nếu không có quyền truy cập dashboard, ghi rõ mục nào chưa kiểm chứng; không tuyên bố tương thích đầy đủ.

## 6. Cập nhật bản cài và xử lý sự cố

Với bản cài **package** từ npm hoặc GitHub, dùng `opencode plugin update opencode-9router-quota` (npm) hoặc làm theo [hướng dẫn plugin OpenCode v2](https://opencode.ai/v2/docs/plugins), rồi chạy lại checklist mục 5. Không dùng đoạn sao chép file bên dưới cho package; nó chỉ dành cho bản cài **local cũ** trong `~/.config/opencode/plugins/9router-quota/`.

Sau khi các bước trên đạt, đóng TUI. **Chỉ với bản cài local hiện tại**, chạy đoạn PowerShell dưới đây tại thư mục dự án để sao lưu và chép ba file mã (không đụng cấu hình hoặc storage). Dừng nếu không tìm thấy thư mục plugin đã cài; không tự tạo thư mục thay thế:

```powershell
$target = Join-Path $env:USERPROFILE '.config\opencode\plugins\9router-quota'
if (-not (Test-Path -LiteralPath $target -PathType Container)) { throw "Plugin directory not found: $target" }
$backupRoot = Join-Path $env:USERPROFILE '.config\opencode\9router-quota-backups'
$backup = Join-Path $backupRoot (Get-Date -Format 'yyyyMMdd-HHmmss')
foreach ($file in @('index.ts', 'tui.tsx', 'quota.ts')) {
  if (-not (Test-Path -LiteralPath (Join-Path $target $file) -PathType Leaf)) { throw "Installed file missing: $file" }
  if (-not (Test-Path -LiteralPath (Join-Path (Resolve-Path 'src').Path $file) -PathType Leaf)) { throw "Source file missing: $file" }
}
New-Item -ItemType Directory -Path $backup | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($true)
foreach ($file in @('index.ts', 'tui.tsx', 'quota.ts')) {
  $source = Join-Path (Resolve-Path 'src').Path $file
  $installed = Join-Path $target $file
  Copy-Item -LiteralPath $installed -Destination (Join-Path $backup $file)
}
foreach ($file in @('index.ts', 'tui.tsx', 'quota.ts')) {
  $source = Join-Path (Resolve-Path 'src').Path $file
  $installed = Join-Path $target $file
  $text = [System.IO.File]::ReadAllText($source).TrimStart([char]0xFEFF)
  $text = $text.Replace('@opencode/ai/providers/', '@opencode-ai/ai/providers/').Replace('@opencode/plugin', '@opencode-ai/plugin')
  $text = [regex]::Replace($text, '\r?\n', "`r`n")
  [System.IO.File]::WriteAllText($installed, $text, $utf8)
}
```

Thư mục `$backup` được đặt **ngoài** `plugins` để OpenCode không vô tình nạp bản sao như plugin thứ hai. Nó chỉ chứa mã plugin; vẫn nên giữ ở máy cá nhân vì mã nguồn có thể thay đổi trong tương lai. Nếu OpenCode mới hỗ trợ import chuẩn từ tài liệu v2, **đừng dùng thay thế import máy móc**: xác minh cách nạp plugin rồi sửa quy trình triển khai cho phiên bản mới. Mở lại OpenCode, chạy `opencode plugin list`, rồi thực hiện lại checklist TUI ở mục 5.

Nếu bản mới lỗi: đóng TUI, phục hồi **chỉ ba file mã plugin** từ bản sao lưu, mở lại và ghi lại bước tái hiện cùng version. Không reset repo, xóa storage hoặc ghi đè cấu hình người dùng để rollback. Tạo ghi chú bảo trì gồm: version/commit trước–sau, URL tài liệu/commit upstream đã đọc, thay đổi API, file đã sửa, test tự động, kết quả TUI và hạn chế còn lại.
