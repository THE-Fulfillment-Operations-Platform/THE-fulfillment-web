import { ref } from 'vue'
import { useToastStore } from '~/stores/toast'

/**
 * Ô chọn file + vùng kéo thả của các dialog import Excel (NVL, SKU cha, SKU con).
 * Chỉ nhận .csv/.xlsx/.xlsm; chọn file mới thì gọi `onChange` để dialog xoá bản
 * xem trước cũ.
 *
 *   const { file, fileName, dragging, onFile, onDrop, reset } = useSpreadsheetFile(() => { preview.value = null })
 */
export function useSpreadsheetFile(onChange?: () => void) {
  const toast = useToastStore()
  const file = ref<File | null>(null)
  const fileName = ref('')
  const dragging = ref(false)

  function setFile(f: File | null | undefined) {
    if (!f) return
    if (!/\.(csv|xlsx|xlsm)$/i.test(f.name)) {
      toast.error('Chỉ nhận file .csv, .xlsx hoặc .xlsm')
      return
    }
    file.value = f
    fileName.value = f.name
    onChange?.()
  }
  function onFile(e: Event) {
    setFile((e.target as HTMLInputElement).files?.[0])
  }
  function onDrop(e: DragEvent) {
    dragging.value = false
    setFile(e.dataTransfer?.files?.[0])
  }
  function reset() {
    file.value = null
    fileName.value = ''
    dragging.value = false
  }

  return { file, fileName, dragging, setFile, onFile, onDrop, reset }
}
