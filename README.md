# 9Router Quota cho OpenCode v2

Xem quota tài khoản 9Router ngay trong sidebar OpenCode và thêm provider OpenAI-compatible hoặc Anthropic mà không cần sửa cấu hình bằng tay.

> **Trạng thái:** Gói `opencode-9router-quota` **chưa được phát hành lên npm**. Trước khi phát hành, hãy cài từ GitHub hoặc mã nguồn theo hướng dẫn bên dưới. Lệnh cài từ npm chỉ dùng được sau khi publish.

## Tính năng

- Hiển thị quota theo **model 9Router đang chọn** → provider → tài khoản đang bật. Khi API có dữ liệu, mỗi hạn mức có thanh phần trăm còn lại, chẳng hạn Codex `5h`/`7d` và Command Code `Credits`/`5h`/`7d`. Plugin không tự tạo phần trăm nếu API không cung cấp đủ dữ liệu.
- Giữ trạng thái xổ/đóng khi chuyển session. Quota được cache theo dashboard URL và model trong phiên TUI, tránh tải lại khi chuyển qua lại giữa các tab.
- Nút **Refresh ↻** và ô **[ ] Auto 60s** (mặc định tắt). Model chưa có cache sẽ được tải một lần; thoát TUI sẽ xóa cache tạm.
- Thêm, đăng nhập lại và xóa provider do plugin quản lý; danh sách model được lấy từ endpoint `/models`. Kết nối **dashboard để đọc quota** và **API key để dùng model** là hai phần riêng biệt.

## Yêu cầu

- OpenCode **v2** hỗ trợ plugin CLI/TUI.
- [9Router](https://github.com/decolua/9router) đang chạy và có tài khoản provider nếu muốn xem quota. URL dashboard mặc định là `http://127.0.0.1:20128`; có thể đổi bằng `/9router-dashboard`. Plugin đọc quota từ API dashboard, không phải `/v1/models`.
- Để thêm provider riêng: endpoint tương thích phải trả danh sách model và API key phải hợp lệ. Chức năng thêm provider vẫn dùng được ngay cả khi không có quyền đọc quota 9Router.

## Cài đặt

### Từ npm — sau khi gói được phát hành

```sh
opencode plugin add opencode-9router-quota
```

Khởi động lại OpenCode; dùng `opencode plugin list` để kiểm tra `9router-quota`. Về sau có thể cập nhật bằng `opencode plugin update opencode-9router-quota`.

### Từ GitHub — sau khi repository được push

```sh
opencode plugin add github:bthien235/opencode-9router-quota
```

Sau khi cài, khởi động lại OpenCode, kiểm tra cả `opencode plugin list` **lẫn** sidebar và lệnh `/connect` trong TUI. GitHub và npm là hai nguồn cài khác nhau; push lên GitHub không tự phát hành lên npm. Xem [tài liệu cài plugin OpenCode v2](https://opencode.ai/v2/docs/plugins).

### Từ thư mục mã nguồn trên máy

Clone/tải repository, cài dependencies trong thư mục dự án:

```sh
npm ci
```

Thêm **đường dẫn tuyệt đối đến thư mục dự án** vào mảng `plugins` trong `opencode.json(c)`:

```jsonc
{
  "plugins": ["/absolute/path/to/checkquota9router"]
}
```

Trên Windows, dùng dấu `/` trong JSON, ví dụ `"D:/UtilityTools/checkquota9router"`. Hãy **thêm** mục này vào cấu hình sẵn có, không ghi đè provider/plugin khác. Khởi động lại OpenCode và chạy `opencode plugin list`. OpenCode tải trực tiếp mã TypeScript; không cần build riêng.

> Nếu từng cài bản local trong `~/.config/opencode/plugins/9router-quota/`, hãy sao lưu rồi tắt/gỡ bản đó **trước khi bật gói mới**. Hai bản cùng chạy có thể tạo sidebar/lệnh trùng lặp. Không xóa `opencode.json` hay dữ liệu plugin để đổi cách cài.

## Bắt đầu sử dụng

1. Mở 9Router và OpenCode TUI, chọn một model đi qua 9Router (ví dụ `cx/...` hoặc `cmc/...`).
2. Gõ `/9router-dashboard`, nhập URL dashboard và mật khẩu nếu dashboard yêu cầu. Thông tin này lưu trong storage của plugin trên OpenCode, **không** nằm trong package công khai.
3. Mở mục **Quota** trên sidebar. Chỉ tài khoản đang bật thuộc provider khớp model được hiển thị. Nhấn **Refresh ↻** để cập nhật ngay; đánh dấu **[ ] Auto 60s** nếu muốn tự làm mới theo chu kỳ. Đây không phải luồng realtime.
4. Muốn thêm provider/model, gõ `/connect`, nhập tên hiển thị, loại API, base URL và API key. Plugin thử lấy model rồi mới hỏi xác nhận lưu. Ví dụ base URL OpenAI-compatible của 9Router local: `http://127.0.0.1:20128/v1`. Với API Anthropic mặc định, có thể để trống base URL.

### Các lệnh trong TUI

| Lệnh | Công dụng |
| --- | --- |
| `/9router-dashboard` | Đặt URL và mật khẩu dashboard dùng để đọc quota. |
| `/connect` | Tạo provider OpenAI-compatible hoặc Anthropic; kiểm tra key bằng cách lấy model trước khi lưu. Bí danh: `/add-provider`. |
| `/reconnect` | Chọn provider do plugin tạo để nhập URL/key mới và lấy lại model. Nếu lấy model thất bại, key cũ không bị thay. Bí danh: `/reconect`. |
| `/connections` | Đăng nhập lại hoặc xóa provider do plugin quản lý. Có thể xóa provider trong `opencode.json` **sau xác nhận và tạo backup**. Bí danh: `/delete-connect`. |

Sau khi thêm/sửa/xóa provider do plugin tạo, server kiểm tra thay đổi storage tối đa mỗi 30 giây; nếu model chưa cập nhật, khởi động lại OpenCode. Xóa provider trong `opencode.json` cần khởi động lại. Hãy chuyển sang model khác trước khi xóa provider đang dùng. `/connections` không chỉnh `opencode.jsonc` hoặc config provider nằm trong dự án.

## Khắc phục lỗi thường gặp

| Hiện tượng | Cần kiểm tra |
| --- | --- |
| Không thấy Quota hoặc lệnh | Xác nhận OpenCode v2, chạy `opencode plugin list`, xem log plugin và kiểm tra không cài hai bản cùng lúc. |
| `Sign in required` / `Offline` | Kiểm tra URL, 9Router đang chạy và mật khẩu trong `/9router-dashboard`. `/v1/models` hoạt động không có nghĩa dashboard đã đăng nhập. |
| `No active accounts` | Bật tài khoản của đúng provider trong 9Router, chọn model tương ứng, nhấn **Refresh ↻**. |
| `No quota` / `Unavailable` | Tài khoản hoặc API upstream có thể không trả quota đủ để tính phần trăm. So với dashboard 9Router; không phải provider nào cũng hỗ trợ quota. |
| Model mới chưa hiện | Chờ tối đa 30 giây cho server đọc storage; nếu cần thì khởi động lại OpenCode. Kiểm tra endpoint trả model với key đã nhập. |
| Hai mục Quota trùng nhau | Chỉ giữ một bản cài; tắt/gỡ bản local cũ. |

**Bảo mật:** Đừng đăng API key, mật khẩu, cookie hoặc toàn bộ `opencode.json` lên issue công khai. Che tên/email tài khoản trong ảnh nếu cần.

## Dành cho người đóng góp

```sh
npm ci
npm run check
npm pack --dry-run
```

`npm run check` chạy TypeScript và test bằng [Bun](https://bun.sh/); Bun cần thiết để chạy test và OpenCode TUI. `src/index.ts` là server transform; `src/tui.tsx` là sidebar/lệnh; `src/quota.ts` xử lý alias, quota và căn thanh; `src/quota.test.ts` chứa unit test. Gói npm chỉ chứa mã runtime, README và tài liệu bảo trì. Xem [hướng dẫn cập nhật và bảo trì](docs/MAINTENANCE.md) khi OpenCode hoặc 9Router thay đổi API.

**Trước khi phát hành công khai:** chủ dự án cần chọn giấy phép và thêm URL repository vào `package.json`; kiểm tra `npm pack --dry-run`, thử cài trên một OpenCode v2 sạch và thử UI thật. `opencode plugin list` chỉ xác nhận plugin được nhận diện, **chưa** xác nhận tính năng chạy đúng. Việc publish lên npm là bước riêng, không xảy ra khi push GitHub.
