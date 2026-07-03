# Master Data / SKU–NVL Setup

Nền tảng dữ liệu để hệ thống biết **mỗi SKU thuộc nguyên vật liệu (NVL) nào** trước
khi gom batch và import đơn hàng.

## Master Data là gì?

Ba bảng dữ liệu cố định:

| Đối tượng | Ý nghĩa |
|-----------|---------|
| **Material** (nguyên vật liệu) | Loại vật liệu xưởng dùng: `Mica trong 3 ly`, `Gỗ 5 ly 3 layer`, … Đây là trục gom batch chính. |
| **SKU** | Mã sản phẩm cố định của seller/khách. |
| **SKU → Material mapping** | Một SKU gắn với 1 (hoặc nhiều, nếu combo) nguyên vật liệu. |

Truy cập: sidebar → **Master Data** (`/master-data`), gồm 4 tab: **Materials**, **SKUs**,
**SKU → Material**, **Import Excel vận hành cũ**. Quyền: `OWNER` / `ADMIN` / `OPS`.

## Vì sao cần SKU → Material?

Production gom việc theo **nguyên vật liệu** (in/cắt gỗ, mica…). Nếu hệ thống không biết
một SKU thuộc NVL nào thì không thể tạo batch. Vì vậy một đơn chỉ import được khi SKU của
nó đã được setup NVL.

## Cách xử lý lỗi SKU_UNMAPPED khi import đơn

Khi import đơn ở màn **Import đơn** (`/import`), mỗi dòng SKU được kiểm tra:

| Mã lỗi | Nghĩa | Cách xử lý |
|--------|-------|-----------|
| `SKU_UNMAPPED` | SKU chưa có trong master data | Vào Master Data → **Import Excel vận hành cũ** hoặc tab **SKUs** để tạo SKU + gán NVL |
| `SKU_NO_MATERIAL` | SKU đã có nhưng chưa gán NVL | Vào Master Data → **SKU → Material** để gán NVL |

Màn Import đơn hiển thị banner tổng hợp + nút **“Setup SKU/NVL”** (deep-link đúng tab), và
mỗi dòng lỗi có link **“→ Setup SKU/NVL”**. Sau khi setup xong, bấm **Validate lại** để
import lại chính file đó — các SKU đã map sẽ hết lỗi.

## Cách import file vận hành cũ

Tab **Import Excel vận hành cũ** tận dụng chính file Excel vận hành hiện tại của xưởng.
Hệ thống chỉ đọc 2 cột **`SKU`** và **`Loại VL`** (tự nhận diện, bỏ dấu tiếng Việt); các
cột khác được bỏ qua.

Luồng **Upload → Preview → Commit**:

1. **Upload** file `.csv` / `.xlsx` (hoặc dán CSV).
2. **Preview** — hệ thống phân tích và báo cáo, **chưa ghi gì**:
   - Tổng dòng, Material mới, SKU mới, Mapping mới, Cần review, Thiếu NVL / lỗi.
   - **Needs Review**: 1 SKU xuất hiện với **nhiều Loại VL khác nhau** → không tự merge,
     sẽ tạo SKU nhưng **không** tự gán NVL.
   - **Missing Material**: SKU có nhưng Loại VL trống → tạo SKU, chưa gán NVL.
   - **Lỗi**: có Loại VL nhưng thiếu SKU → bỏ qua dòng.
3. **Commit** — áp dụng kế hoạch: find-or-create Material (khớp theo tên), find-or-create
   SKU (khớp theo mã), và thêm mapping cho các SKU chỉ có **đúng 1** Loại VL. Thao tác
   **cộng thêm**, không bao giờ xoá mapping sẵn có.

> Nguyên tắc: **không tự đoán nguyên vật liệu**. Thiếu dữ liệu thì báo (Needs Review /
> Missing Material) để người dùng bổ sung, không gán bừa.

## API

| Method | Path | Mô tả |
|--------|------|-------|
| `GET/POST/PUT/DELETE` | `/api/materials`, `/api/materials/:id` | CRUD nguyên vật liệu |
| `GET/POST/PUT/DELETE` | `/api/skus`, `/api/skus/:id` | CRUD SKU (materials tuỳ chọn) |
| `POST` | `/api/master-data/import/preview` | Preview file vận hành cũ (multipart `file` hoặc JSON `rows`) |
| `POST` | `/api/master-data/import/commit` | Commit theo `import_job_id` |
| `GET`  | `/api/master-data/import-jobs` | Danh sách job |
| `GET`  | `/api/master-data/import-jobs/:id` | Chi tiết plan của 1 job |
