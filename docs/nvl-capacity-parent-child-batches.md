# Định mức NVL & Batch mẹ–con

Cho phép OWNER đặt **định mức sản xuất** cho từng nguyên vật liệu (NVL): *1 đơn vị NVL
(1 tấm / 1 lô) làm được tối đa bao nhiêu sản phẩm*. Khi tạo batch mà tổng sản phẩm
vượt định mức, hệ thống tự chẻ thành **1 batch mẹ + nhiều batch con**, mỗi con ≤ định mức.

## Quy tắc nghiệp vụ

- **Định mức** = `Material.products_per_unit`. Bỏ trống/`null`/≤0 = **không giới hạn** →
  batch tạo phẳng như cũ (không mẹ–con).
- **Đếm theo sản phẩm** = tổng `quantity` của các order-item được chọn (không phải số dòng).
- **Không cắt đôi một order-item**: một item luôn nằm trọn trong một batch con. Item lẻ có
  `quantity` > định mức sẽ chiếm riêng một con vượt định mức (không thể chia nhỏ hơn).
- Số batch con = số nhóm sau khi nhồi greedy (xem `utils/batch.ts` → `planBatchSplit`).
- **Quyền**: chỉ `OWNER` được set/sửa `products_per_unit`. `ADMIN`/`OPS` vẫn CRUD material
  bình thường nhưng không gửi/không đổi được field này.

## Hợp đồng API (frontend + backend ĐÃ implement)

> Trạng thái: **hoàn tất cả FE lẫn BE** (`THE-fulfillment-api`, Go/Gin/GORM). Chạy
> thật được, không chỉ mock. Cột mới do GORM AutoMigrate tự thêm khi khởi động API.
> Vị trí code BE ở cuối tài liệu.

### 1. Material thêm `products_per_unit`
```
GET/POST/PUT /api/materials(/:id)
  material.products_per_unit: number | null   // định mức; null = không giới hạn
```
- Chỉ chấp nhận ghi `products_per_unit` khi actor là OWNER (403 nếu khác).

### 2. `POST /api/batches` tự chẻ mẹ–con
Input **giữ nguyên**: `{ material_id, order_item_ids[], priority?, due_date?, note? }`.

Backend đọc `products_per_unit` của material:
- **≤ định mức** (hoặc không giới hạn): tạo 1 batch phẳng → trả `{ batch, skipped_item_ids }` như cũ.
- **> định mức**: tạo **1 batch mẹ** + **k batch con** (atomic, cùng transaction), rồi trả:
```
{
  batch: {                       // batch MẸ
    ...Batch,
    is_parent: true,
    child_count: k,
    child_batches: [ ...Batch ]  // các con, mỗi con: parent_batch_id, sequence, items[]
  },
  skipped_item_ids: number[]
}
```
- Đề xuất mã: mẹ `#<id>`, con `#<id>-1`, `#<id>-2`, … theo `sequence`.

### 3. Batch có quan hệ mẹ–con
```
Batch.is_parent?: boolean
Batch.parent_batch_id?: number | null   // set trên CON
Batch.sequence?: number                  // thứ tự con trong mẹ
Batch.child_count?: number               // trên MẸ
Batch.child_batches?: Batch[]            // MẸ preload ở GET /api/batches/:id
```

### 4. `GET /api/batches`
- Mặc định trả **batch mẹ + batch phẳng**, **ẩn batch con** (khỏi rối danh sách).
- Thêm filter `?parent_batch_id=<id>` để lấy riêng các con của một mẹ.

### 5. QC / roll-up trạng thái (ĐÃ làm)
- Batch mẹ không giữ item trực tiếp; item nằm ở các con.
- Trạng thái mẹ được **roll-up từ các con** (least-advanced): mẹ chỉ `QC_PASSED` khi mọi con
  đã `QC_PASSED`. Kích hoạt ở cả 2 đường: QC quét (`recomputeBatchStatus`) và board sản xuất
  (`BatchService.UpdateStatus`) — xem `internal/services/status.go` → `recomputeParentBatchStatus`.

## Vị trí code backend (THE-fulfillment-api)

| Việc | File |
|------|------|
| Model | `internal/models/master.go` (`Material.ProductsPerUnit`), `internal/models/production.go` (`Batch.ParentBatchID/IsParent/Sequence/ChildCount/ChildBatches`) |
| Định mức OWNER-only | `internal/services/catalog_service.go` (`MaterialInput`, `MaterialUpdateInput`, guard `RoleOwner`), `internal/handlers/catalog_handler.go` |
| Chẻ mẹ–con khi tạo | `internal/services/batch_service.go` (`Create` + `planBatchSplit`) |
| Roll-up trạng thái mẹ | `internal/services/status.go` (`recomputeParentBatchStatus`) |
| List ẩn con + filter | `internal/repositories/production_repo.go` (`BatchFilter.ParentBatchID`, `baseQuery`, `FindByID` preload, `ChildBatchesFor`), `internal/handlers/batch_handler.go` |
| Test | `internal/services/batch_split_test.go` (split 20+5, flat, unlimited, roll-up) |

> Lưu ý: DB dùng GORM AutoMigrate → chỉ cần khởi động lại API là có cột mới (đều nullable/
> default, an toàn, không cần migration script tay).
> Vá kèm: `UpdateMaterial` trước đây nhận `MaterialInput` (bắt buộc `code`) nên update material
> bỏ `code` sẽ bị 422 — nay tách `MaterialUpdateInput` (code/name optional), theo đúng
> convention `SKUUpdateInput` có sẵn.

## Vị trí code frontend

| Việc | File |
|------|------|
| Kiểu dữ liệu | `types/index.ts` (`Material.products_per_unit`, `Batch.is_parent/parent_batch_id/sequence/child_count/child_batches`) |
| Thuật toán chẻ | `utils/batch.ts` → `planBatchSplit`, `productCount` |
| Setup định mức (OWNER) | `components/master-data/MaterialsTab.vue` |
| API | `services/api/masters.ts` (`MaterialInput`), `services/api/batches.ts` (`BatchListParams.parent_batch_id`) |
| Preview chẻ khi tạo batch | `pages/batches/new.vue` |
| Hiển thị mẹ–con | `pages/batches/index.vue` (badge), `pages/batches/[id].vue` (danh sách con / link về mẹ) |
| Demo/mock | `services/mock.ts` (MICA cap 20 → 25 item chẻ 20+5; METAL cap 10 → 12 item chẻ 10+2) |
