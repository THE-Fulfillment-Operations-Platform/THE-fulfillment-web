# Huỷ đơn ở Seller Portal — huỷ cả đơn & huỷ từng sản phẩm

Trước đây seller chỉ có một nút **"Huỷ đơn"** → huỷ nguyên đơn, mọi sản phẩm bên
trong bị huỷ theo. Nay bổ sung **huỷ từng sản phẩm (đơn nhỏ) bên trong**, giữ
nguyên các sản phẩm còn lại.

Quy tắc (do khách chốt): huỷ từng sản phẩm **theo đúng luồng huỷ cả đơn hiện tại**:

- Đơn còn trong **luồng import / chờ duyệt** (`can_cancel = true`) → huỷ sản phẩm
  **trực tiếp**, không cần vận hành duyệt.
- Đơn **đã được duyệt hoặc đã vào sản xuất** (`can_request_cancellation = true`) →
  huỷ sản phẩm là **yêu cầu huỷ**, vận hành phải duyệt mới thực sự huỷ.

Frontend đã làm xong (giao diện + demo chạy trên mock). Phần dưới là **hợp đồng
API mà backend cần bổ sung** để chạy thật.

---

## 1. Thay đổi payload — thêm 2 trường vào mỗi sản phẩm

Endpoint `GET /api/seller/orders/{id}` trả về `items[]`. Mỗi phần tử cần thêm:

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|---|---|---|---|
| `id` | number | **Có** | ID line-item (chính là `OrderItem.id` nội bộ). Bắt buộc để chỉ đích danh sản phẩm cần huỷ — SKU/tên **không** duy nhất trong 1 đơn (một đơn có thể lặp cùng SKU nhiều lần, xem ví dụ trong ảnh: 3 dòng cùng `BR-SH-2-KEP`). |
| `cancellation_status` | enum | Nên có | Trạng thái huỷ của riêng sản phẩm. Thiếu ⇒ coi như `NONE`. |

`cancellation_status` dùng lại enum `CancellationStatus` sẵn có:
`NONE` · `SELLER_CANCELLED` · `REQUESTED` · `APPROVED` · `REJECTED`.

FE hiển thị theo trạng thái item:
- `SELLER_CANCELLED` hoặc `APPROVED` → gạch ngang + nhãn **"Đã huỷ"**, ẩn nút huỷ.
- `REQUESTED` → nhãn **"Chờ xử lý huỷ"**, ẩn nút huỷ.
- `NONE` / `REJECTED` → sản phẩm còn hiệu lực, hiện nút huỷ (nếu đơn cho phép).

Ví dụ 1 item:

```json
{
  "id": 4821,
  "sku_code": "BR-SH-2-KEP",
  "product_name": "Móc khoá len Cải bó xôi",
  "variant_code": null,
  "quantity": 1,
  "mockup_url": "https://…",
  "cancellation_status": "NONE"
}
```

---

## 2. Hai endpoint mới

Cả hai nhận `reason` (tuỳ chọn) trong body và **trả về `SellerOrder` đã cập nhật**
(cùng shape với `GET /api/seller/orders/{id}`), để FE render lại ngay sau khi gọi.

### 2.1. Huỷ trực tiếp một sản phẩm

```
POST /api/seller/orders/{orderId}/items/{itemId}/cancel
Body: { "reason"?: string }
```

- Chỉ cho phép khi đơn đang ở trạng thái huỷ-trực-tiếp (tương đương điều kiện đang
  bật `can_cancel` cho cả đơn). Ngoài trạng thái đó → trả lỗi (xem mục 4).
- Đặt `cancellation_status = "SELLER_CANCELLED"` cho item.
- Nếu **mọi** sản phẩm trong đơn đều đã huỷ ⇒ huỷ luôn cả đơn
  (`order.cancellation_status = "SELLER_CANCELLED"`, `review_status = "CANCELLED"`).

### 2.2. Yêu cầu huỷ một sản phẩm

```
POST /api/seller/orders/{orderId}/items/{itemId}/cancellation-request
Body: { "reason"?: string }
```

- Chỉ cho phép khi đơn đang ở trạng thái yêu-cầu-huỷ (tương đương `can_request_cancellation`).
- Đặt `cancellation_status = "REQUESTED"` cho item; đơn giữ nguyên trạng thái, chờ
  vận hành duyệt.
- Vận hành duyệt/từ chối yêu cầu ở đâu là do backend quyết định (có thể tái dùng
  luồng `cancellation-requests` hiện có, nhưng ở mức **item** thay vì cả đơn).
  Khi duyệt → item `APPROVED` (coi như đã huỷ); khi từ chối → `REJECTED`.

> **Cần làm rõ với vận hành:** yêu cầu huỷ đang được quản lý ở mức đơn
> (`/api/cancellation-requests`). Với huỷ theo item, backend cần bổ sung mức item —
> hoặc một bảng yêu-cầu-huỷ-item, hoặc mở rộng bảng hiện tại kèm `item_id`.

---

## 3. Cách FE chọn "huỷ trực tiếp" hay "yêu cầu"

FE **không tự suy luận theo review_status**, mà bám vào 2 cờ mức đơn có sẵn:

```
if (order.can_cancel)                 → nút "Huỷ"          → gọi 2.1
else if (order.can_request_cancellation) → nút "Yêu cầu huỷ" → gọi 2.2
else                                  → không hiện nút huỷ item
```

Nhờ vậy huỷ-item luôn khớp đúng quy tắc mà backend đã áp cho huỷ-cả-đơn. Backend
chỉ cần đảm bảo 2 cờ này phản ánh đúng trạng thái đơn (đã có sẵn).

---

## 4. Lỗi

Trả JSON envelope lỗi như các endpoint khác (`success:false`, `error.code`,
`error.message`). Một số case nên chặn:

- Item không thuộc đơn / không tồn tại → `404`.
- Đơn/mặt hàng không còn ở trạng thái được huỷ (đã sản xuất xong, đã gửi, đã huỷ) →
  `409` (hoặc mã lỗi nghiệp vụ) kèm message tiếng Việt.
- Item đã `SELLER_CANCELLED`/`REQUESTED` rồi mà gọi lại → `409`.

---

## 5. File FE liên quan (đã sửa xong)

- `types/index.ts` — thêm `id` + `cancellation_status` vào `SellerOrderItem`.
- `services/api/seller.ts` — thêm `cancelItem()` và `requestItemCancellation()`.
- `pages/seller/[id].vue` — nút huỷ/ trạng thái từng sản phẩm + nút huỷ cả đơn,
  modal xác nhận dùng chung.
- `services/mock.ts` — dữ liệu + xử lý mock cho demo (không ảnh hưởng backend thật).
- `plugins/api.client.ts` — sửa cờ bật mock (xem README chạy demo bên dưới).

---

## 6. Chạy demo bằng mock (không cần backend)

```bash
NUXT_PUBLIC_USE_MOCK=true npm run dev
```

Đăng nhập seller (mock): `seller@the.local` / `Password123!`. Ba đơn mẫu:

- **US-0925-008** — chờ duyệt → huỷ **trực tiếp** từng sản phẩm.
- **US-0925-011** — đang sản xuất → **yêu cầu huỷ** từng sản phẩm.
- **US-0925-014** — trộn trạng thái (một item đã huỷ, một item chờ xử lý huỷ).
