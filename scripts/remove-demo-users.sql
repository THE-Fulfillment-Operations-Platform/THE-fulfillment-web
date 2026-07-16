-- Xoá cứng toàn bộ tài khoản demo (owner@the.local … ) khỏi bảng users.
--
-- QUAN TRỌNG: phải đặt SEED_DEMO_USERS=false ở backend TRƯỚC khi chạy, nếu không
-- seeder sẽ tạo lại chúng ở lần khởi động server kế tiếp.
--
-- Cách chạy: Supabase → SQL Editor → dán toàn bộ file này → Run.
-- Script tự tháo mọi khóa ngoại (nullable) trỏ tới user demo trước khi DELETE,
-- nên các bản ghi thật (batch/đơn/… do user demo tạo) vẫn giữ nguyên, chỉ mất
-- liên kết "người tạo". Audit log dùng actor_email snapshot nên không bị ảnh hưởng.

-- (Tuỳ chọn) xem trước sẽ xoá những ai:
--   SELECT id, email, role, is_active FROM users WHERE email LIKE '%@the.local';

DO $$
DECLARE
  demo_emails text[] := ARRAY[
    'owner@the.local','admin@the.local','ops@the.local','designer@the.local',
    'production@the.local','qc@the.local','packing@the.local',
    'shipping@the.local','seller@the.local'
  ];
  ids  bigint[];
  fk   record;
BEGIN
  SELECT array_agg(id) INTO ids FROM users WHERE email = ANY(demo_emails);
  IF ids IS NULL THEN
    RAISE NOTICE 'Không tìm thấy user demo nào — DB đã sạch.';
    RETURN;
  END IF;

  -- Tháo mọi FK (nullable) trỏ tới users → DELETE không bị chặn.
  FOR fk IN
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema   = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
     AND tc.table_schema   = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema    = 'public'
      AND ccu.table_name     = 'users'
  LOOP
    EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I = ANY($1)',
                   fk.table_name, fk.column_name, fk.column_name)
      USING ids;
  END LOOP;

  DELETE FROM users WHERE id = ANY(ids);
  RAISE NOTICE 'Đã xoá % tài khoản demo.', array_length(ids, 1);
END $$;
