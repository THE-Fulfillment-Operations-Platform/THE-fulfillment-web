/**
 * Bấm vào bất kỳ đâu trên một dòng bảng để mở trang chi tiết của dòng đó.
 *
 *   const { rowLinkAttrs } = useRowLink()
 *   <tr v-bind="rowLinkAttrs(`/batches/${b.id}`)">
 *
 * Ba điều kiện phải giữ, nên logic nằm ở một chỗ thay vì chép vào từng bảng:
 *
 *  1. Click vào phần tử tương tác trong dòng (checkbox chọn nhiều, nút Sửa/Xoá,
 *     link khác…) KHÔNG được mở chi tiết — người dùng đang bấm hành động của
 *     dòng chứ không phải mở dòng.
 *  2. Bôi đen để copy mã đơn không được biến thành cú click mở trang.
 *  3. Ctrl/Cmd/giữa chuột vẫn phải mở tab mới như một cái link bình thường, và
 *     bàn phím (Tab → Enter) vẫn đi được — vì thế dòng có tabindex + role.
 */
export function useRowLink() {
  const router = useRouter()

  // Bấm trúng thứ gì đó có hành vi riêng thì để nó xử lý.
  function isInteractive(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null
    return Boolean(el?.closest('a,button,input,select,textarea,label,[role="button"]'))
  }

  function open(to: string, e: MouseEvent) {
    if (isInteractive(e.target)) return
    // Người dùng vừa bôi đen chữ trong dòng — mouseup này là kết thúc thao tác
    // chọn text, không phải một cú click.
    if (window.getSelection()?.toString()) return
    // Giữ đúng thói quen của link: Ctrl/Cmd/Shift + click mở tab/cửa sổ mới.
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      window.open(to, '_blank')
      return
    }
    router.push(to)
  }

  // `to` rỗng = dòng này không có trang chi tiết (vd item chưa gắn được đơn):
  // trả về rỗng để dòng hành xử y như trước, không con trỏ tay, không điều hướng.
  function rowLinkAttrs(to?: string | null) {
    if (!to) return {}
    return {
      class: 'cursor-pointer',
      tabindex: 0,
      role: 'link',
      onClick: (e: MouseEvent) => open(to, e),
      // Chuột giữa = mở tab mới, giống click giữa vào một cái link.
      onAuxclick: (e: MouseEvent) => {
        if (e.button === 1 && !isInteractive(e.target)) {
          e.preventDefault()
          window.open(to, '_blank')
        }
      },
      onKeydown: (e: KeyboardEvent) => {
        if (e.key !== 'Enter' || isInteractive(e.target)) return
        e.preventDefault()
        router.push(to)
      },
    }
  }

  return { rowLinkAttrs }
}
