// Bài thử lõi die-cut trên hình đã biết trước đáp án. Sai số cho phép ĐẶT THEO
// một điểm ảnh của ảnh đầu vào, nên ảnh nét hơn thì ngưỡng tự siết — đó mới là
// bằng chứng thuật toán hội tụ, chứ không phải nới ngưỡng cho qua.
import { analyze, buildGeometry, DEFAULT_SETTINGS } from './pipeline'
import { buildDxf, verifyDxf } from './dxf'
import { buildCutSvg } from './svg'
import { signedArea, perimeter } from './contour'
import { flattenCurve, type Curve } from './curve'

/** Góc gãy lớn nhất (độ) tại các mối nối khúc cong — 0 nghĩa là trơn tuyệt đối. */
function maxJointKink(curve: Curve): number {
  let worst = 0
  for (let i = 0; i < curve.length; i++) {
    const a = curve[i]
    const b = curve[(i + 1) % curve.length]
    const inDir = [a[3][0] - a[2][0], a[3][1] - a[2][1]]
    const outDir = [b[1][0] - b[0][0], b[1][1] - b[0][1]]
    const ang = Math.abs(Math.atan2(inDir[0] * outDir[1] - inDir[1] * outDir[0], inDir[0] * outDir[0] + inDir[1] * outDir[1]))
    if (ang > worst) worst = ang
  }
  return (worst * 180) / Math.PI
}

/** Góc đổi hướng lớn nhất (độ) giữa hai đoạn kề nhau của đa giác. */
function maxPolyTurn(ring: [number, number][]): number {
  let worst = 0
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const p = ring[(i - 1 + n) % n], q = ring[i], r = ring[(i + 1) % n]
    const a = [q[0] - p[0], q[1] - p[1]], b = [r[0] - q[0], r[1] - q[1]]
    const ang = Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]))
    if (ang > worst) worst = ang
  }
  return (worst * 180) / Math.PI
}

let failures = 0
function check(name: string, ok: boolean, detail: string) {
  if (!ok) failures++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} — ${detail}`)
}

function circleImage(size: number, alpha: boolean) {
  const data = new Uint8ClampedArray(size * size * 4)
  const c = size / 2
  const r = size * 0.25
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const inside = Math.hypot(x - c + 0.5, y - c + 0.5) <= r
      if (alpha) {
        data[i] = 200
        data[i + 1] = 60
        data[i + 2] = 60
        data[i + 3] = inside ? 255 : 0
      } else {
        data[i] = inside ? 20 : 255
        data[i + 1] = inside ? 120 : 255
        data[i + 2] = inside ? 60 : 253
        data[i + 3] = 255
      }
    }
  }
  return { width: size, height: size, data } as unknown as ImageData
}

// --- Hình tròn ở hai độ phân giải ------------------------------------------
for (const size of [200, 800]) {
  const s = {
    ...DEFAULT_SETTINGS,
    artworkWidthMm: 100,
    offsetMm: 3,
    holes: [{ xRatio: 0.5, yRatio: 0.05 }],
  }
  const a = analyze(circleImage(size, true), s, 1, 1)!
  const g = buildGeometry(a, s)!
  const mmPerPx = 100 / (a.bbox.x1 - a.bbox.x0 + 1)
  const expectedW = 100 + 2 * s.offsetMm
  const expectedPerim = Math.PI * expectedW
  const expectedArea = (Math.PI * expectedW * expectedW) / 4
  const area = Math.abs(signedArea(g.rings[0]))
  const tolW = 2 * mmPerPx // lệch tối đa một điểm ảnh mỗi bên
  const tolArea = expectedPerim * mmPerPx

  check(`[${size}px] một đường cắt`, g.rings.length === 1, `ring=${g.rings.length}`)
  check(`[${size}px] khổ ngang`, Math.abs(g.widthMm - expectedW) < tolW, `${g.widthMm.toFixed(2)} mm, chờ ${expectedW} ±${tolW.toFixed(2)}`)
  check(`[${size}px] khổ dọc`, Math.abs(g.heightMm - expectedW) < tolW, `${g.heightMm.toFixed(2)} mm`)
  check(`[${size}px] chu vi`, Math.abs(perimeter(g.rings[0]) - expectedPerim) < expectedPerim * 0.02, `${perimeter(g.rings[0]).toFixed(1)} mm, chờ ${expectedPerim.toFixed(1)}`)
  check(`[${size}px] diện tích`, Math.abs(area - expectedArea) < tolArea, `${area.toFixed(0)} mm², chờ ${expectedArea.toFixed(0)} ±${tolArea.toFixed(0)}`)
  check(`[${size}px] vị trí hình trong khung`, Math.abs(g.artwork.xMm - s.offsetMm) < tolW, `x=${g.artwork.xMm.toFixed(2)} mm, chờ ${s.offsetMm}`)
  check(`[${size}px] lỗ đặt đúng chỗ`, g.holes.length === 1 && Math.abs(g.holes[0].cyMm - g.heightMm * 0.05) < 0.2 && Math.abs(g.holes[0].cxMm - g.widthMm / 2) < 0.2, `(${g.holes[0]?.cxMm.toFixed(1)}, ${g.holes[0]?.cyMm.toFixed(1)}) mm`)
  check(`[${size}px] không báo nhầm chỗ mảnh`, !g.warnings.some((w) => w.includes('mảnh')), g.warnings.join(' | ') || 'không cảnh báo')
  check(`[${size}px] file cắt gọn`, g.stats.pointCount < 600, `${g.stats.pointCount} điểm`)
  check(`[${size}px] hình tròn → ít khúc cong`, g.stats.nodeCount <= 16, `${g.stats.nodeCount} khúc`)
  check(`[${size}px] mối nối trơn (G1)`, maxJointKink(g.curves[0]) < 0.5, `gãy tối đa ${maxJointKink(g.curves[0]).toFixed(2)}°`)
  check(`[${size}px] DXF không có góc gãy nhìn thấy`, maxPolyTurn(g.rings[0]) <= 2.05, `đổi hướng tối đa ${maxPolyTurn(g.rings[0]).toFixed(2)}°/đỉnh`)
}

// --- Viền 0 và viền âm -----------------------------------------------------
{
  const s = { ...DEFAULT_SETTINGS, artworkWidthMm: 100, offsetMm: 0 }
  const g = buildGeometry(analyze(circleImage(800, true), s, 1, 1)!, s)!
  check('viền 0 → khổ bằng hình', Math.abs(g.widthMm - 100) < 0.5, `${g.widthMm.toFixed(2)} mm`)
}
{
  const s = { ...DEFAULT_SETTINGS, artworkWidthMm: 100, offsetMm: -4 }
  const g = buildGeometry(analyze(circleImage(800, true), s, 1, 1)!, s)!
  check('viền âm → cắt lẹm vào', Math.abs(g.widthMm - 92) < 0.5, `${g.widthMm.toFixed(2)} mm, chờ 92`)
}

// --- Ảnh nền trắng ---------------------------------------------------------
{
  const s = { ...DEFAULT_SETTINGS, artworkWidthMm: 100, offsetMm: 3, mode: 'flood' as const }
  const g = buildGeometry(analyze(circleImage(800, false), s, 1, 1)!, s)!
  check('tách nền trắng ra đúng khổ', Math.abs(g.widthMm - 106) < 0.5, `${g.widthMm.toFixed(2)} mm, chờ 106`)
}

// --- Hai hình rời ----------------------------------------------------------
{
  const w = 800, h = 400
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    if (Math.hypot(x - 200, y - 200) <= 120 || Math.hypot(x - 600, y - 200) <= 120) data[i + 3] = 255
  }
  const s = { ...DEFAULT_SETTINGS, artworkWidthMm: 200, offsetMm: 2 }
  const g = buildGeometry(analyze({ width: w, height: h, data } as unknown as ImageData, s, 1, 1)!, s)!
  check('hai hình rời → hai đường cắt', g.rings.length === 2, `${g.rings.length} đường`)
}

// --- Hình vành khuyên: phải giữ đường cắt bên trong -------------------------
{
  const size = 800
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4
    const d = Math.hypot(x - 400, y - 400)
    if (d <= 300 && d >= 120) data[i + 3] = 255
  }
  const s = { ...DEFAULT_SETTINGS, artworkWidthMm: 100, offsetMm: 0 }
  const a = analyze({ width: size, height: size, data } as unknown as ImageData, s, 1, 1)!
  const g = buildGeometry(a, s)!
  check('vành khuyên → 2 đường (ngoài + lỗ)', g.rings.length === 2, `${g.rings.length} đường`)

  // Bỏ bằng tay: neo đặt ngay trên đường lỗ → còn 1 đường và đường lỗ nằm ở
  // danh sách đã bỏ; neo trên đường bao → bị từ chối, vẫn đủ 2.
  const byArea = [...g.rings].sort((x, y) => Math.abs(signedArea(x)) - Math.abs(signedArea(y)))
  const anchorOf = (r: (typeof g.rings)[number]) => ({ xRatio: r[0][0] / g.widthMm, yRatio: r[0][1] / g.heightMm })
  const g2 = buildGeometry(a, { ...s, skippedRings: [anchorOf(byArea[0])] })!
  check('bỏ đường lỗ bằng tay → còn 1 đường', g2.rings.length === 1 && g2.skippedRings.length === 1, `${g2.rings.length} đường, ${g2.skippedRings.length} đã bỏ`)
  check('khổ cắt không đổi khi bỏ đường', Math.abs(g2.widthMm - g.widthMm) < 0.01, `${g2.widthMm.toFixed(2)} vs ${g.widthMm.toFixed(2)} mm`)
  const g3 = buildGeometry(a, { ...s, skippedRings: [anchorOf(byArea[1])] })!
  check('không bỏ được đường bao ngoài', g3.rings.length === 2 && g3.skippedRings.length === 0, `${g3.rings.length} đường`)
  const g4 = buildGeometry(a, { ...s, skippedRings: [{ xRatio: 0.5, yRatio: 0.5 }] })!
  check('neo không sát đường nào → không bỏ gì', g4.rings.length === 2, `${g4.rings.length} đường`)
}

// --- Cổng cảnh báo chỗ mảnh ------------------------------------------------
{
  const w = 900, h = 600
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    const inside =
      Math.hypot(x - 180, y - 300) <= 120 ||
      Math.hypot(x - 720, y - 300) <= 120 ||
      (x > 180 && x < 720 && Math.abs(y - 300) <= 3)
    if (inside) data[i + 3] = 255
  }
  const s = { ...DEFAULT_SETTINGS, artworkWidthMm: 100, offsetMm: 0, thinWarnMm: 2 }
  const g = buildGeometry(analyze({ width: w, height: h, data } as unknown as ImageData, s, 1, 1)!, s)!
  check('bắt được cổ thắt mảnh', g.warnings.some((x) => x.includes('mảnh')), g.warnings.join(' | ') || 'KHÔNG cảnh báo')
}

// --- Cảnh báo lỗ treo sát mép và ảnh thiếu nét ------------------------------
{
  const s = {
    ...DEFAULT_SETTINGS,
    artworkWidthMm: 100,
    offsetMm: 1,
    holes: [{ xRatio: 0.5, yRatio: 0.03 }],
    holeDiameterMm: 6,
  }
  const g = buildGeometry(analyze(circleImage(800, true), s, 1, 1)!, s)!
  check('bắt được lỗ sát mép', g.warnings.some((x) => x.includes('Lỗ 1')), g.warnings.join(' | ') || 'KHÔNG cảnh báo')
}
{
  const s = { ...DEFAULT_SETTINGS, artworkWidthMm: 300 }
  const g = buildGeometry(analyze(circleImage(200, true), s, 1, 1)!, s)!
  check('bắt được ảnh thiếu nét', g.warnings.some((x) => x.includes('DPI')), g.warnings.join(' | ') || 'KHÔNG cảnh báo')
}

// --- DXF + SVG -------------------------------------------------------------
{
  const s = { ...DEFAULT_SETTINGS, artworkWidthMm: 100, offsetMm: 3, holes: [{ xRatio: 0.5, yRatio: 0.05 }] }
  const g = buildGeometry(analyze(circleImage(800, true), s, 1, 1)!, s)!
  const dxf = buildDxf({
    rings: g.rings,
    circles: g.holes.map((h) => ({ cx: h.cxMm, cy: h.cyMm, r: h.rMm, layer: 'LO_KHOAN' })),
    widthMm: g.widthMm,
    heightMm: g.heightMm,
    layer: 'CUT',
  })
  const problems = verifyDxf(dxf, { rings: g.rings.length, circles: 1, widthMm: g.widthMm, heightMm: g.heightMm })
  check('DXF đọc ngược sạch', problems.length === 0, problems.join(' | ') || 'không lỗi')
  check('DXF dùng POLYLINE chứ không LWPOLYLINE', dxf.includes('POLYLINE') && !dxf.includes('LWPOLYLINE'), 'ok')
  check('DXF kết thúc dòng CRLF', !/[^\r]\n/.test(dxf), 'ok')
  const ys = [...dxf.matchAll(/\r\n20\r\n([-\d.]+)/g)].map((m) => Number(m[1]))
  check('DXF lật trục Y đúng khổ', Math.max(...ys) <= g.heightMm + 0.01 && Math.min(...ys) >= -0.01, `y ∈ [${Math.min(...ys).toFixed(2)}, ${Math.max(...ys).toFixed(2)}] / ${g.heightMm.toFixed(2)}`)
  const holeY = Number(dxf.split('CIRCLE')[1].split('\r\n20\r\n')[1].split('\r\n')[0])
  check('DXF: lỗ treo ở nửa trên', holeY > g.heightMm / 2, `y=${holeY.toFixed(2)} / khổ ${g.heightMm.toFixed(2)}`)

  const svg = buildCutSvg({ curves: g.curves, holes: g.holes, widthMm: g.widthMm, heightMm: g.heightMm, title: 'thử' })
  check('SVG ghi kích thước bằng mm', /width="[\d.]+mm" height="[\d.]+mm"/.test(svg), svg.match(/width="[^"]+" height="[^"]+"/)?.[0] ?? '')
  check('SVG viewBox 1:1', svg.includes(`viewBox="0 0 ${(Math.round(g.widthMm * 1000) / 1000).toString()}`), 'ok')
  check('SVG đủ đường cắt', (svg.match(/<path/g) || []).length === g.curves.length, 'ok')
  check('SVG là đường cong thật (C), không có nét thẳng (L)', / C /.test(svg) && !/ L /.test(svg), 'ok')
}

// --- Hình chạm mép ảnh (file design cắt khít, hay gặp nhất) -----------------
// Lỗi thật từng gặp: không chừa lề trống quanh ảnh thì đường cắt không vòng ra
// ngoài được, file cắt thành mấy đoạn zigzag vô nghĩa.
{
  const w = 900, h = 1100
  const data = new Uint8ClampedArray(w * h * 4)
  const r = w / 2
  const shoulder = h * 0.45
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inside = y >= shoulder ? true : Math.hypot(x - r, (shoulder - y) * (r / shoulder)) <= r
    if (inside) data[(y * w + x) * 4 + 3] = 255
  }
  const s = { ...DEFAULT_SETTINGS, artworkWidthMm: 83, offsetMm: 5 }
  const g = buildGeometry(analyze({ width: w, height: h, data } as unknown as ImageData, s, 1, 1)!, s)!
  check('hình chạm mép → một đường cắt kín', g.rings.length === 1, `${g.rings.length} đường, ${g.stats.pointCount} điểm`)
  check('hình chạm mép → đúng khổ', Math.abs(g.widthMm - 93) < 0.5 && Math.abs(g.heightMm - (83 * h / w + 10)) < 0.5, `${g.widthMm.toFixed(1)} × ${g.heightMm.toFixed(1)} mm, chờ 93.0 × ${(83 * h / w + 10).toFixed(1)}`)
  check('hình chạm mép → viền đều 5 mm', Math.abs(g.artwork.xMm - 5) < 0.5 && Math.abs(g.artwork.yMm - 5) < 0.5, `lề trái ${g.artwork.xMm.toFixed(2)} mm, lề trên ${g.artwork.yMm.toFixed(2)} mm`)
}

// --- Đặt khổ lệch tỷ lệ gốc: ảnh làm việc phải được kéo trước ---------------
// Hình vuông 100 mm, người dùng đặt 100 × 150 mm (kéo cao 50%). Ảnh làm việc
// kéo theo trục dọc nên viền cắt vẫn phải đều 5 mm ở cả bốn phía.
{
  const size = 800
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (x >= 100 && x < 700 && y >= 100 && y < 700) data[(y * size + x) * 4 + 3] = 255
  }
  const img = { width: size, height: size, data } as unknown as ImageData
  const s = { ...DEFAULT_SETTINGS, artworkWidthMm: 100, artworkHeightMm: 150, lockAspect: false, offsetMm: 5 }
  // Mô phỏng đúng việc trang làm: kéo trục dọc 1,5 lần rồi mới phân tích.
  const stretched = { width: size, height: size * 3 / 2, data: new Uint8ClampedArray(size * (size * 3 / 2) * 4) } as unknown as ImageData
  for (let y = 0; y < size * 3 / 2; y++) {
    const sy = Math.min(size - 1, Math.floor(y * 2 / 3))
    for (let x = 0; x < size; x++) {
      stretched.data[(y * size + x) * 4 + 3] = data[(sy * size + x) * 4 + 3]
    }
  }
  const g = buildGeometry(analyze(stretched, s, 1, 1.5)!, s)!
  check('khổ lệch tỷ lệ → đúng số đo đặt', Math.abs(g.widthMm - 110) < 0.6 && Math.abs(g.heightMm - 160) < 0.6, `${g.widthMm.toFixed(1)} × ${g.heightMm.toFixed(1)} mm, chờ 110.0 × 160.0`)
  check('khổ lệch tỷ lệ → viền vẫn đều 5 mm', Math.abs(g.artwork.xMm - 5) < 0.4 && Math.abs(g.artwork.yMm - 5) < 0.4, `lề trái ${g.artwork.xMm.toFixed(2)} mm, lề trên ${g.artwork.yMm.toFixed(2)} mm`)
  check('khổ lệch tỷ lệ → có cảnh báo kéo méo', g.warnings.some((w) => w.includes('kéo')), g.warnings.join(' | ') || 'KHÔNG cảnh báo')
  check('kéo méo đo đúng 50%', Math.abs(g.stats.stretchPct - 50) < 2, `${g.stats.stretchPct.toFixed(1)}%`)
}

// --- Nhiều lỗ: rải 4 lỗ thành hàng ngang -----------------------------------
{
  const size = 800
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (x >= 80 && x < 720 && y >= 80 && y < 720) data[(y * size + x) * 4 + 3] = 255
  }
  const img = { width: size, height: size, data } as unknown as ImageData
  const holes = [0.2, 0.4, 0.6, 0.8].map((x) => ({ xRatio: x, yRatio: 0.1 }))
  const s = { ...DEFAULT_SETTINGS, artworkWidthMm: 100, offsetMm: 5, holes, holeDiameterMm: 4 }
  const g = buildGeometry(analyze(img, s, 1, 1)!, s)!
  check('4 lỗ ra đủ 4', g.holes.length === 4, `${g.holes.length} lỗ`)
  check('4 lỗ cách đều nhau', Math.abs((g.holes[1].cxMm - g.holes[0].cxMm) - (g.holes[3].cxMm - g.holes[2].cxMm)) < 0.2, g.holes.map((h) => h.cxMm.toFixed(1)).join(' · '))
  check('4 lỗ đều đủ vật liệu', g.holes.every((h) => h.clearanceMm > 2), g.holes.map((h) => h.clearanceMm.toFixed(1)).join(' · '))
  const dxf = buildDxf({ rings: g.rings, circles: g.holes.map((h) => ({ cx: h.cxMm, cy: h.cyMm, r: h.rMm, layer: 'LO_KHOAN' })), widthMm: g.widthMm, heightMm: g.heightMm, layer: 'CAT' })
  check('DXF ghi đủ 4 lỗ', verifyDxf(dxf, { rings: g.rings.length, circles: 4, widthMm: g.widthMm, heightMm: g.heightMm }).length === 0, 'ok')
  const svg = buildCutSvg({ curves: g.curves, holes: g.holes, widthMm: g.widthMm, heightMm: g.heightMm, title: 'n lỗ' })
  check('SVG ghi đủ 4 lỗ', (svg.match(/<circle/g) || []).length === 4, 'ok')
}

// --- Góc vuông ở viền 0 phải ra góc vuông, không bo ----------------------------
{
  const size = 800
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (x >= 100 && x < 700 && y >= 100 && y < 500) data[(y * size + x) * 4 + 3] = 255
  }
  const img = { width: size, height: size, data } as unknown as ImageData
  const s = { ...DEFAULT_SETTINGS, artworkWidthMm: 120, offsetMm: 0, roundInsideMm: 0 }
  const g = buildGeometry(analyze(img, s, 1, 1)!, s)!
  const c = g.curves[0]
  const kinks = Array.from({ length: c.length }, (_, i) => {
    const a = c[i], b = c[(i + 1) % c.length]
    const u = [a[3][0] - a[2][0], a[3][1] - a[2][1]], v = [b[1][0] - b[0][0], b[1][1] - b[0][1]]
    return (Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])) * 180) / Math.PI
  })
  const sharp = kinks.filter((k) => k > 60).length
  check('hình chữ nhật viền 0 → đúng 4 góc gãy', sharp === 4, `${sharp} góc gãy > 60°, các mối nối: ${kinks.map((k) => k.toFixed(0)).join('/')}`)
  check('hình chữ nhật viền 0 → góc đúng 90°', kinks.filter((k) => k > 60).every((k) => Math.abs(k - 90) < 1.5), kinks.filter((k) => k > 60).map((k) => k.toFixed(1)).join('/'))
  const corner = c.map((seg) => seg[0]).reduce((best, p) => (p[0] + p[1] < best[0] + best[1] ? p : best), c[0][0])
  check('hình chữ nhật viền 0 → nút góc nằm đúng đỉnh', Math.hypot(corner[0], corner[1]) < 0.15, `góc trên-trái tại (${corner[0].toFixed(3)}, ${corner[1].toFixed(3)}) mm`)
  check('hình chữ nhật viền 0 → ít khúc', c.length <= 12, `${c.length} khúc`)
  check('hình chữ nhật viền 0 → đúng khổ', Math.abs(g.widthMm - 120) < 0.3 && Math.abs(g.heightMm - 80) < 0.3, `${g.widthMm.toFixed(2)} × ${g.heightMm.toFixed(2)} mm`)
}

// --- Bo góc lõm: hai đĩa chồng nhau tạo cổ lõm nhọn -----------------------------
{
  const w = 1000, h = 600
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (Math.hypot(x - 320, y - 300) <= 220 || Math.hypot(x - 680, y - 300) <= 220) data[(y * w + x) * 4 + 3] = 255
  }
  const img = { width: w, height: h, data } as unknown as ImageData
  const base = { ...DEFAULT_SETTINGS, artworkWidthMm: 90, offsetMm: 0 }
  const a = analyze(img, { ...base, roundInsideMm: 6 }, 1, 1)!
  const sharp = buildGeometry(a, { ...base, roundInsideMm: 0 })!
  const round = buildGeometry(a, { ...base, roundInsideMm: 6 })!
  const areaS = Math.abs(signedArea(sharp.rings[0]))
  const areaR = Math.abs(signedArea(round.rings[0]))
  // Cổ lõm giữa hai đĩa được lấp thêm vật liệu; góc lồi và khổ không đổi.
  check('bo góc lõm → có thêm vật liệu ở cổ', areaR > areaS + 10, `${areaS.toFixed(0)} → ${areaR.toFixed(0)} mm²`)
  check('bo góc lõm → khổ không đổi', Math.abs(round.widthMm - sharp.widthMm) < 0.15 && Math.abs(round.heightMm - sharp.heightMm) < 0.15, `${sharp.widthMm.toFixed(2)}×${sharp.heightMm.toFixed(2)} vs ${round.widthMm.toFixed(2)}×${round.heightMm.toFixed(2)} mm`)
  check('bo góc lõm → không còn góc gãy', maxJointKink(round.curves[0]) < 5, `gãy tối đa ${maxJointKink(round.curves[0]).toFixed(1)}°`)
  check('không bo → cổ vẫn là góc nhọn', maxJointKink(sharp.curves[0]) > 30, `gãy tối đa ${maxJointKink(sharp.curves[0]).toFixed(1)}°`)
  // Đường cong bám sát bản chia mịn: chia lại rất mịn rồi so từng điểm với đường
  // đồng mức gốc là việc của phép đo diện tích ở trên; ở đây kiểm chu vi hợp lý.
  const perimR = perimeter(round.rings[0])
  const flat = flattenCurve(round.curves[0], 0.001, 0.5 * Math.PI / 180)
  check('chia mịn hơn nữa không đổi chu vi', Math.abs(perimeter(flat) - perimR) < perimR * 0.002, `${perimR.toFixed(2)} vs ${perimeter(flat).toFixed(2)} mm`)
}

console.log(failures ? `\n${failures} phép thử HỎNG` : '\nTất cả phép thử đạt')
process.exit(failures ? 1 : 0)
