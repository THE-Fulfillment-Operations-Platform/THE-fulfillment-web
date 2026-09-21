// Euclidean distance transform (Felzenszwalb & Huttenlocher 2012) — O(số điểm ảnh),
// cho khoảng cách CHÍNH XÁC chứ không phải xấp xỉ kiểu chamfer.
//
// Cả công cụ die-cut đứng trên hàm này: đường cắt là đường đồng mức của trường
// khoảng cách (viền 3 mm = nơi cách hình đúng 3 mm), chỗ mảnh dễ gãy là nơi
// khoảng cách-vào-trong nhỏ, và khoảng hở của lỗ treo cũng đo bằng nó. Một thuật
// toán, ba việc — thay vì ba phép xấp xỉ khác nhau.

const INF = 1e20

// Biến đổi khoảng cách bình phương trên MỘT chiều: hạ bao lồi dưới của các
// parabol dựng tại từng ô. v = vị trí đỉnh parabol đang thắng, z = biên giao nhau.
function edt1d(f: Float64Array, d: Float64Array, v: Int32Array, z: Float64Array, n: number): void {
  let k = 0
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    const dq = q - v[k]
    d[q] = dq * dq + f[v[k]]
  }
}

/**
 * Khoảng cách (đơn vị: điểm ảnh) từ mỗi điểm tới điểm gần nhất có giá trị
 * `target`. Điểm bản thân đã là `target` thì khoảng cách bằng 0.
 */
export function distanceTransform(
  mask: Uint8Array,
  w: number,
  h: number,
  target: 0 | 1,
): Float32Array {
  const n = Math.max(w, h)
  const f = new Float64Array(n)
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  const grid = new Float64Array(w * h)

  for (let i = 0; i < w * h; i++) grid[i] = mask[i] === target ? 0 : INF

  // Cột trước, hàng sau — tính chất tách được của khoảng cách Euclid bình phương.
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x]
    edt1d(f, d, v, z, h)
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y]
  }
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) f[x] = grid[row + x]
    edt1d(f, d, v, z, w)
    for (let x = 0; x < w; x++) grid[row + x] = d[x]
  }

  const out = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(grid[i])
  return out
}

/**
 * Trường khoảng cách CÓ DẤU tới MÉP hình: âm ở trong, dương ở ngoài, 0 đúng trên
 * mép. Đường cắt viền `k` mm chính là đường đồng mức mức `k`, nên chỉ tính một
 * lần rồi kéo thanh trượt viền là ra đường mới — không phải nở lại ảnh mỗi lần.
 *
 * Nửa điểm ảnh ở đây không phải chi tiết vụn: biến đổi khoảng cách đo từ TÂM
 * điểm ảnh này tới TÂM điểm ảnh kia, nên điểm sát biên đã ra 1 chứ không ra 0 —
 * mép thật nằm giữa hai tâm, tức cách mỗi bên nửa điểm ảnh. Không trừ nửa này
 * thì viền 3 mm cắt ra còn 2,5 mm và sai số đó nằm im trong mọi file gửi xưởng.
 */
export function signedDistanceField(mask: Uint8Array, w: number, h: number): Float32Array {
  const outside = distanceTransform(mask, w, h, 1) // >0 khi ở ngoài hình
  const inside = distanceTransform(mask, w, h, 0) // >0 khi ở trong hình
  const sdf = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const d = outside[i] - inside[i]
    sdf[i] = d > 0 ? d - 0.5 : d + 0.5
  }
  // Không làm mượt thêm: đã thử trung bình 3 điểm, gợn bậc thang gần như không
  // giảm (nó đến từ chính việc ảnh gốc là lưới điểm ảnh) mà hình lại co theo độ
  // cong. Sai số còn lại dưới 1 điểm ảnh — ở khổ làm việc 1600 px cho sản phẩm
  // 100 mm là 0,06 mm, nhỏ hơn mạch cắt của laser.
  return sdf
}
