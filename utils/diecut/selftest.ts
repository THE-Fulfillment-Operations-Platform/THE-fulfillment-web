// Bài thử lõi die-cut trên hình đã biết trước đáp án. Sai số cho phép ĐẶT THEO
// một điểm ảnh của ảnh đầu vào, nên ảnh nét hơn thì ngưỡng tự siết — đó mới là
// bằng chứng thuật toán hội tụ, chứ không phải nới ngưỡng cho qua.
import { analyze, buildGeometry, DEFAULT_SETTINGS } from './pipeline'
import { buildDxf, verifyDxf } from './dxf'
import { buildCutSvg } from './svg'
import { signedArea, perimeter } from './contour'

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
    hole: { ...DEFAULT_SETTINGS.hole, enabled: true },
  }
  const a = analyze(circleImage(size, true), s, 1)!
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
  check(`[${size}px] lỗ treo cách mép đúng`, !!g.hole && Math.abs(g.hole.cyMm - (s.hole.marginMm + s.hole.diameterMm / 2)) < tolW, `cy=${g.hole?.cyMm.toFixed(2)}, chờ ${s.hole.marginMm + s.hole.diameterMm / 2}`)
  check(`[${size}px] không báo nhầm chỗ mảnh`, !g.warnings.some((w) => w.includes('mảnh')), g.warnings.join(' | ') || 'không cảnh báo')
  check(`[${size}px] file cắt gọn`, g.stats.pointCount < 600, `${g.stats.pointCount} điểm`)
}

// --- Viền 0 và viền âm -----------------------------------------------------
{
  const s = { ...DEFAULT_SETTINGS, artworkWidthMm: 100, offsetMm: 0 }
  const g = buildGeometry(analyze(circleImage(800, true), s, 1)!, s)!
  check('viền 0 → khổ bằng hình', Math.abs(g.widthMm - 100) < 0.5, `${g.widthMm.toFixed(2)} mm`)
}
{
  const s = { ...DEFAULT_SETTINGS, artworkWidthMm: 100, offsetMm: -4 }
  const g = buildGeometry(analyze(circleImage(800, true), s, 1)!, s)!
  check('viền âm → cắt lẹm vào', Math.abs(g.widthMm - 92) < 0.5, `${g.widthMm.toFixed(2)} mm, chờ 92`)
}

// --- Ảnh nền trắng ---------------------------------------------------------
{
  const s = { ...DEFAULT_SETTINGS, artworkWidthMm: 100, offsetMm: 3, mode: 'flood' as const }
  const g = buildGeometry(analyze(circleImage(800, false), s, 1)!, s)!
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
  const g = buildGeometry(analyze({ width: w, height: h, data } as unknown as ImageData, s, 1)!, s)!
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
  const g = buildGeometry(analyze({ width: size, height: size, data } as unknown as ImageData, s, 1)!, s)!
  check('vành khuyên → 2 đường (ngoài + lỗ)', g.rings.length === 2, `${g.rings.length} đường`)
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
  const g = buildGeometry(analyze({ width: w, height: h, data } as unknown as ImageData, s, 1)!, s)!
  check('bắt được cổ thắt mảnh', g.warnings.some((x) => x.includes('mảnh')), g.warnings.join(' | ') || 'KHÔNG cảnh báo')
}

// --- Cảnh báo lỗ treo sát mép và ảnh thiếu nét ------------------------------
{
  const s = {
    ...DEFAULT_SETTINGS,
    artworkWidthMm: 100,
    offsetMm: 1,
    hole: { enabled: true, diameterMm: 6, marginMm: 0.2, xRatio: 0.5 },
  }
  const g = buildGeometry(analyze(circleImage(800, true), s, 1)!, s)!
  check('bắt được lỗ treo sát mép', g.warnings.some((x) => x.includes('Lỗ treo')), g.warnings.join(' | ') || 'KHÔNG cảnh báo')
}
{
  const s = { ...DEFAULT_SETTINGS, artworkWidthMm: 300 }
  const g = buildGeometry(analyze(circleImage(200, true), s, 1)!, s)!
  check('bắt được ảnh thiếu nét', g.warnings.some((x) => x.includes('DPI')), g.warnings.join(' | ') || 'KHÔNG cảnh báo')
}

// --- DXF + SVG -------------------------------------------------------------
{
  const s = { ...DEFAULT_SETTINGS, artworkWidthMm: 100, offsetMm: 3, hole: { ...DEFAULT_SETTINGS.hole, enabled: true } }
  const g = buildGeometry(analyze(circleImage(800, true), s, 1)!, s)!
  const dxf = buildDxf({
    rings: g.rings,
    circles: g.hole ? [{ cx: g.hole.cxMm, cy: g.hole.cyMm, r: g.hole.rMm, layer: 'LO_TREO' }] : [],
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

  const svg = buildCutSvg({ rings: g.rings, hole: g.hole ?? undefined, widthMm: g.widthMm, heightMm: g.heightMm, title: 'thử' })
  check('SVG ghi kích thước bằng mm', /width="[\d.]+mm" height="[\d.]+mm"/.test(svg), svg.match(/width="[^"]+" height="[^"]+"/)?.[0] ?? '')
  check('SVG viewBox 1:1', svg.includes(`viewBox="0 0 ${(Math.round(g.widthMm * 1000) / 1000).toString()}`), 'ok')
  check('SVG đủ đường cắt', (svg.match(/<path/g) || []).length === g.rings.length, 'ok')
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
  const g = buildGeometry(analyze({ width: w, height: h, data } as unknown as ImageData, s, 1)!, s)!
  check('hình chạm mép → một đường cắt kín', g.rings.length === 1, `${g.rings.length} đường, ${g.stats.pointCount} điểm`)
  check('hình chạm mép → đúng khổ', Math.abs(g.widthMm - 93) < 0.5 && Math.abs(g.heightMm - (83 * h / w + 10)) < 0.5, `${g.widthMm.toFixed(1)} × ${g.heightMm.toFixed(1)} mm, chờ 93.0 × ${(83 * h / w + 10).toFixed(1)}`)
  check('hình chạm mép → viền đều 5 mm', Math.abs(g.artwork.xMm - 5) < 0.5 && Math.abs(g.artwork.yMm - 5) < 0.5, `lề trái ${g.artwork.xMm.toFixed(2)} mm, lề trên ${g.artwork.yMm.toFixed(2)} mm`)
}

console.log(failures ? `\n${failures} phép thử HỎNG` : '\nTất cả phép thử đạt')
process.exit(failures ? 1 : 0)
