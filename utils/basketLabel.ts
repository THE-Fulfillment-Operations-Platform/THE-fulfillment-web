import type { Basket } from '~/types'

// Tem giỏ chờ — in ra để GHÉP CÙNG HÀNG trong giỏ (anh Kiên, 20/10/2026).
//
// Đọc bằng mắt từ xa là chính: người nhặt giỏ chỉ hỏi "giỏ số mấy, đơn nào, mấy
// sản phẩm". Nên số giỏ chiếm gần nửa tem. QR mang mã giỏ (GIO-37) để quét ở màn
// Giỏ chờ khi xác nhận bó đủ.
//
// Khổ KHOÁ CỨNG 70x50mm, mọi kích thước bằng mm — cùng chuẩn tem sản phẩm (xem
// pages/batches/[id].vue): in Tỉ lệ 100% thì máy nào cũng ra đúng cỡ. Không dùng
// màu xám: máy in nhiệt chỉ có đen/trắng.

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/**
 * Mở cửa sổ in tem giỏ. PHẢI gọi thẳng trong sự kiện bấm của người dùng (trình duyệt
 * chặn popup mở sau await). Trả false khi popup bị chặn.
 */
export function printBasketLabel(b: Basket): boolean {
  const w = window.open('', '_blank', 'width=480,height=420')
  if (!w) return false
  w.document.write('<!doctype html><meta charset="utf-8"><body style="font:14px sans-serif;padding:24px">Đang tạo tem giỏ…</body>')
  void (async () => {
    let qr = ''
    try {
      const QRCode = (await import('qrcode')).default
      qr = await QRCode.toDataURL(b.code, { margin: 1, width: 512 })
    } catch { /* QR không bắt buộc — tem vẫn đọc được bằng mắt */ }
    const origin = window.location.origin
    const date = new Date(b.created_at || Date.now()).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const qty = b.total_qty && b.total_qty !== b.total_items ? ` (${b.total_qty} cái)` : ''
    // Số giỏ 1–3 chữ số: hạ cỡ khi 3 chữ số để không tràn sang cột QR.
    const numSize = String(b.number).length >= 3 ? '17mm' : '22mm'
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Tem giỏ ${esc(b.number)}</title>
      <style>
        @page { size: 70mm 50mm; margin: 0; }
        html, body { margin: 0; padding: 0; }
        @font-face { font-family: 'Inter'; font-style: normal; font-weight: 100 900; font-display: block;
          src: url('${origin}/fonts/inter-vietnamese.woff2') format('woff2');
          unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB; }
        @font-face { font-family: 'Inter'; font-style: normal; font-weight: 100 900; font-display: block;
          src: url('${origin}/fonts/inter-latin.woff2') format('woff2');
          unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
        body { font-family: 'Inter', "Segoe UI", -apple-system, "Helvetica Neue", Arial, sans-serif; color: #000;
          -webkit-font-smoothing: antialiased; font-feature-settings: "zero" 0; }
        .label { box-sizing: border-box; width: 70mm; height: 50mm; padding: 1.5mm; overflow: hidden; }
        .frame { box-sizing: border-box; width: 100%; height: 100%; border: 0.6mm solid #000; border-radius: 1mm;
          padding: 1.5mm 2mm; display: flex; flex-direction: column; }
        .kind { font-size: 3mm; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; line-height: 1; }
        .mid { flex: 1; display: flex; align-items: center; justify-content: space-between; gap: 2mm; min-height: 0; }
        .num { font-weight: 700; line-height: 0.95; letter-spacing: -0.03em; white-space: nowrap; }
        .num .hash { font-size: 8mm; font-weight: 400; margin-right: 0.5mm; vertical-align: 0.5em; }
        .qr { width: 19mm; height: 19mm; flex: 0 0 auto; }
        .foot { border-top: 0.3mm solid #000; padding-top: 1mm; }
        .order { font-size: 4mm; font-weight: 700; line-height: 1.1; overflow-wrap: anywhere; }
        .sub { font-size: 2.6mm; font-weight: 400; line-height: 1.25; overflow-wrap: anywhere; }
      </style></head><body>
      <div class="label"><div class="frame">
        <div class="kind">Giỏ chờ · ${esc(b.code)}</div>
        <div class="mid">
          <div class="num" style="font-size:${numSize}"><span class="hash">#</span>${esc(b.number)}</div>
          ${qr ? `<img class="qr" src="${esc(qr)}" alt="${esc(b.code)}" />` : ''}
        </div>
        <div class="foot">
          <div class="order">Đơn ${esc(b.order_code)} · ${esc(b.total_items)} SP${esc(qty)}</div>
          <div class="sub">${esc(b.store_order_id)}${b.seller_name ? ' · ' + esc(b.seller_name) : ''} · ${esc(date)}</div>
        </div>
      </div></div>
      <script>
        (function () {
          var printed = false;
          function go() { if (!printed) { printed = true; window.print(); } }
          if (document.fonts && document.fonts.ready) {
            Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 3000); })]).then(go);
          } else { window.addEventListener('load', go); }
          setTimeout(go, 5000);
        })();
      <\/script></body></html>`
    w.document.open()
    w.document.write(html)
    w.document.close()
  })()
  return true
}
