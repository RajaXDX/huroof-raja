-- ============================================================================
--  حروف مع رجا — جداول الأونلاين
-- ============================================================================
--
--  يُشغَّل مرة واحدة في **نفس مشروع Supabase** الذي تستعمله «تحدي رجا»
--  و«توب تن». كل ما هنا مسبوق بـ hr_ فلا يمسّ جداول اللعبتين الأخريين.
--
--  ⚠️ شغّل كل دفعة وحدها في محرر SQL. المحرر ينفّذ اللصقة **كمعاملة واحدة**،
--     فخطأ في أمر واحد يُلغي كل شيء بصمت ولا تعرف أين وقع.
--
--  ↩️ للتراجع: آخر الملف دفعة تحذف كل ما أضافه هذا السكربت.
--
-- ============================================================================
--
--  لماذا لا يوجد تسجيل دخول؟
--  الوضع المحلي يبقى بلا حساب، ولا معنى لأن يطلب الأونلاين ما لا يطلبه هو.
--  البديل: كل جهاز يولّد `token` عشوائياً ويحفظه، والعضوية تُثبت به. و anon
--  **ممنوع من الجدول تماماً** — كل شيء يمرّ بالدوال أدناه وهي تفحص التوكن.
--
-- ============================================================================


-- ======================== الدفعة 1: الجدول ========================

CREATE TABLE IF NOT EXISTS hr_rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,
  status      text NOT NULL DEFAULT 'waiting',   -- waiting | playing | ended
  -- حتى ثمانية لاعبين، ولكلٍّ مقعد وفريق. المضيف هو صاحب المقعد 0.
  players     jsonb NOT NULL DEFAULT '[]'::jsonb,
  state       jsonb,
  version     int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_rooms_code_idx    ON hr_rooms (code);
CREATE INDEX IF NOT EXISTS hr_rooms_created_idx ON hr_rooms (created_at);

ALTER TABLE hr_rooms ENABLE ROW LEVEL SECURITY;

-- ⚠️ **لا سياسة ولا صلاحية لأحد.** RLS مفعّلة بلا أي سياسة = لا أحد يصل
-- للجدول مباشرة. الدوال أدناه SECURITY DEFINER فتعمل بصلاحية مالكها.
REVOKE ALL ON hr_rooms FROM anon, authenticated;


-- ======================== الدفعة 2: أدوات داخلية ========================

-- كود من 6 خانات بلا حروف تلتبس بالنطق أو بالشكل (0/O و1/I محذوفة عمداً —
-- الكود يُقال بالصوت، وحرف ملتبس يعني محاولة دخول فاشلة).
CREATE OR REPLACE FUNCTION hr_new_code() RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM hr_rooms WHERE code = candidate);
  END LOOP;
  RETURN candidate;
END;
$fn$;

-- الصورة التي تُعاد للمتصفح. ⚠️ **التوكنات تُنزع هنا** — لو سُرِّب توكن
-- لاعب لأمكن اللعب بدلاً عنه. المكان الوحيد الذي يخرج منه توكن هو ردّ
-- الإنشاء/الدخول لصاحبه وحده.
CREATE OR REPLACE FUNCTION hr_public_room(r hr_rooms) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object(
    'code',    r.code,
    'status',  r.status,
    'state',   r.state,
    'version', r.version,
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'seat',   (p->>'seat')::int,
               'name',   p->>'name',
               'team',   p->>'team',
               'online', (COALESCE((p->>'seen')::timestamptz, r.created_at) > now() - interval '45 seconds')
             ) ORDER BY (p->>'seat')::int)
      FROM jsonb_array_elements(r.players) p
    ), '[]'::jsonb)
  );
$fn$;

CREATE OR REPLACE FUNCTION hr_seat_of(r hr_rooms, p_token text) RETURNS int
LANGUAGE sql STABLE AS $fn$
  SELECT (p->>'seat')::int
  FROM jsonb_array_elements(r.players) p
  WHERE p->>'token' = p_token
  LIMIT 1;
$fn$;

-- تُحدّث ختم الحضور لصاحب التوكن وتُعيد الصف
CREATE OR REPLACE FUNCTION hr_touch(p_id uuid, p_token text) RETURNS hr_rooms
LANGUAGE sql AS $fn$
  UPDATE hr_rooms SET players = (
    SELECT jsonb_agg(CASE WHEN p->>'token' = p_token
                          THEN p || jsonb_build_object('seen', now())
                          ELSE p END)
    FROM jsonb_array_elements(players) p
  )
  WHERE id = p_id
  RETURNING *;
$fn$;


-- ======================== الدفعة 3: الإنشاء والدخول ========================

CREATE OR REPLACE FUNCTION hr_create_room(p_name text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r hr_rooms;
BEGIN
  IF p_token IS NULL OR length(p_token) < 12 THEN
    RETURN jsonb_build_object('error', 'bad_token');
  END IF;

  -- تنظيف انتهازي: الرومات المهجورة تُحذف مع كل إنشاء، فلا نحتاج مهمة مجدولة
  DELETE FROM hr_rooms WHERE created_at < now() - interval '12 hours';

  INSERT INTO hr_rooms (code, players)
  VALUES (
    hr_new_code(),
    jsonb_build_array(jsonb_build_object(
      'seat', 0, 'name', left(COALESCE(NULLIF(btrim(p_name), ''), 'المضيف'), 20),
      'team', 'A', 'token', p_token, 'seen', now()
    ))
  )
  RETURNING * INTO r;

  RETURN hr_public_room(r) || jsonb_build_object('you', 0);
END;
$fn$;

CREATE OR REPLACE FUNCTION hr_join_room(p_code text, p_name text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r     hr_rooms;
  seat  int;
  a_cnt int;
  b_cnt int;
BEGIN
  IF p_token IS NULL OR length(p_token) < 12 THEN
    RETURN jsonb_build_object('error', 'bad_token');
  END IF;

  -- ⚠️ القفل ضروري: لو دخل اثنان في نفس اللحظة لأخذا نفس المقعد
  SELECT * INTO r FROM hr_rooms WHERE code = upper(btrim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  seat := hr_seat_of(r, p_token);

  -- عائد بعد انقطاع أو تحديث صفحة: يستعيد مقعده وفريقه كما هما
  IF seat IS NOT NULL THEN
    r := hr_touch(r.id, p_token);
    RETURN hr_public_room(r) || jsonb_build_object('you', seat);
  END IF;

  IF jsonb_array_length(r.players) >= 8 THEN
    RETURN jsonb_build_object('error', 'full');
  END IF;

  -- ⚠️ لا يدخل أحد بعد بدء المباراة: اللوحة نصفها ملعوب والجولات جارية
  IF r.status <> 'waiting' THEN
    RETURN jsonb_build_object('error', 'started');
  END IF;

  -- الفريق الأقلّ عدداً — حتى لا يبدأ الجميع في فريق واحد والمضيف يوزّع يدوياً
  SELECT count(*) FILTER (WHERE p->>'team' = 'A'),
         count(*) FILTER (WHERE p->>'team' = 'B')
    INTO a_cnt, b_cnt
  FROM jsonb_array_elements(r.players) p;

  -- المقعد = أصغر رقم شاغر، فلا يتضخّم الترقيم بعد خروج ودخول متكرّرين
  SELECT COALESCE(MIN(s), 0) INTO seat
  FROM generate_series(0, 7) s
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(r.players) p WHERE (p->>'seat')::int = s
  );

  UPDATE hr_rooms SET
    players = players || jsonb_build_array(jsonb_build_object(
      'seat', seat, 'name', left(COALESCE(NULLIF(btrim(p_name), ''), 'لاعب'), 20),
      'team', CASE WHEN a_cnt <= b_cnt THEN 'A' ELSE 'B' END,
      'token', p_token, 'seen', now()
    )),
    updated_at = now()
  WHERE id = r.id RETURNING * INTO r;

  RETURN hr_public_room(r) || jsonb_build_object('you', seat);
END;
$fn$;


-- ======================== الدفعة 4: الفرق ========================

-- نقل لاعب بين الفريقين — **للمضيف وحده**، وهو صاحب المقعد 0.
CREATE OR REPLACE FUNCTION hr_set_team(p_code text, p_token text,
                                       p_seat int, p_team text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r hr_rooms;
BEGIN
  IF p_team NOT IN ('A', 'B') THEN RETURN jsonb_build_object('error', 'bad_team'); END IF;

  SELECT * INTO r FROM hr_rooms WHERE code = upper(btrim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF hr_seat_of(r, p_token) IS DISTINCT FROM 0 THEN
    RETURN jsonb_build_object('error', 'not_host');
  END IF;

  -- ⚠️ التوزيع قبل البدء فقط: نقل لاعب وسط جولة يقلب من يملك الدور
  IF r.status <> 'waiting' THEN RETURN jsonb_build_object('error', 'started'); END IF;

  UPDATE hr_rooms SET
    players = (
      SELECT jsonb_agg(CASE WHEN (p->>'seat')::int = p_seat
                            THEN p || jsonb_build_object('team', p_team)
                            ELSE p END)
      FROM jsonb_array_elements(players) p
    ),
    updated_at = now()
  WHERE id = r.id RETURNING * INTO r;

  RETURN hr_public_room(r) || jsonb_build_object('you', 0);
END;
$fn$;


-- ======================== الدفعة 5: الحالة والحضور ========================

CREATE OR REPLACE FUNCTION hr_snapshot(p_code text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r    hr_rooms;
  seat int;
BEGIN
  SELECT * INTO r FROM hr_rooms WHERE code = upper(btrim(p_code));
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  seat := hr_seat_of(r, p_token);
  IF seat IS NULL THEN RETURN jsonb_build_object('error', 'not_member'); END IF;

  r := hr_touch(r.id, p_token);
  RETURN hr_public_room(r) || jsonb_build_object('you', seat);
END;
$fn$;

-- ⚠️ **الكتابة لأي عضو لا للمضيف وحده — مقصود.** صاحب الدور يفتح الخلية
-- ويبثّ، وهو ليس المضيف غالباً. الحارس الحقيقي هو `p_version`: من يكتب
-- فوق نسخة أحدث يُرفض ويُعاد له الأحدث بدل أن يمحوها.
CREATE OR REPLACE FUNCTION hr_push(p_code text, p_token text, p_state jsonb,
                                   p_status text, p_version int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r    hr_rooms;
  seat int;
BEGIN
  SELECT * INTO r FROM hr_rooms WHERE code = upper(btrim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  seat := hr_seat_of(r, p_token);
  IF seat IS NULL THEN RETURN jsonb_build_object('error', 'not_member'); END IF;

  IF p_version <= r.version THEN
    RETURN hr_public_room(r) || jsonb_build_object('you', seat, 'stale', true);
  END IF;

  UPDATE hr_rooms SET
    state   = p_state,
    status  = COALESCE(NULLIF(p_status, ''), status),
    version = p_version,
    updated_at = now()
  WHERE id = r.id;

  r := hr_touch(r.id, p_token);
  RETURN hr_public_room(r) || jsonb_build_object('you', seat);
END;
$fn$;

CREATE OR REPLACE FUNCTION hr_leave(p_code text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r hr_rooms;
BEGIN
  SELECT * INTO r FROM hr_rooms WHERE code = upper(btrim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true); END IF;
  IF hr_seat_of(r, p_token) IS NULL THEN RETURN jsonb_build_object('ok', true); END IF;

  UPDATE hr_rooms SET
    players = COALESCE((
      SELECT jsonb_agg(p) FROM jsonb_array_elements(players) p
      WHERE p->>'token' <> p_token
    ), '[]'::jsonb),
    updated_at = now()
  WHERE id = r.id RETURNING * INTO r;

  -- ⚠️ خروج المضيف يُنهي الروم: هو المقدّم والحَكَم، ولا معنى لبقائها بعده.
  -- والباقون يُعلمون بذلك عند أول استعلام (not_found) فلا يعلقون بانتظاره.
  IF jsonb_array_length(r.players) = 0
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.players) p
                    WHERE (p->>'seat')::int = 0) THEN
    DELETE FROM hr_rooms WHERE id = r.id;
    RETURN jsonb_build_object('ok', true, 'closed', true);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$fn$;


-- ======================== الدفعة 6: الصلاحيات ========================

REVOKE ALL ON FUNCTION hr_create_room(text, text)              FROM public;
REVOKE ALL ON FUNCTION hr_join_room(text, text, text)          FROM public;
REVOKE ALL ON FUNCTION hr_set_team(text, text, int, text)      FROM public;
REVOKE ALL ON FUNCTION hr_snapshot(text, text)                 FROM public;
REVOKE ALL ON FUNCTION hr_push(text, text, jsonb, text, int)   FROM public;
REVOKE ALL ON FUNCTION hr_leave(text, text)                    FROM public;

GRANT EXECUTE ON FUNCTION hr_create_room(text, text)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION hr_join_room(text, text, text)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION hr_set_team(text, text, int, text)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION hr_snapshot(text, text)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION hr_push(text, text, jsonb, text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION hr_leave(text, text)                  TO anon, authenticated;

-- الدوال الداخلية لا تُنادى من المتصفح
REVOKE ALL ON FUNCTION hr_new_code()                FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION hr_public_room(hr_rooms)     FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION hr_seat_of(hr_rooms, text)   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION hr_touch(uuid, text)         FROM public, anon, authenticated;


-- ======================== الدفعة 7: التحقق ========================
-- المتوقّع: الجدول موجود، RLS مفعّلة، **صفر** سياسات، ولا صلاحية جدول لـ anon،
-- وستّ دوال قابلة للتنفيذ من anon.

SELECT relname, relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policies WHERE tablename = 'hr_rooms') AS policies
FROM pg_class WHERE relname = 'hr_rooms';

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'hr_rooms' AND grantee IN ('anon', 'authenticated');

SELECT p.proname, r.rolname AS granted_to
FROM pg_proc p
CROSS JOIN LATERAL (VALUES ('anon'), ('authenticated')) AS r(rolname)
WHERE p.proname LIKE 'hr\_%'
  AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
ORDER BY p.proname, r.rolname;


-- ============================================================================
-- ↩️ العودة (تحذف كل ما أضافه هذا الملف)
-- ============================================================================
-- DROP FUNCTION IF EXISTS hr_create_room(text, text);
-- DROP FUNCTION IF EXISTS hr_join_room(text, text, text);
-- DROP FUNCTION IF EXISTS hr_set_team(text, text, int, text);
-- DROP FUNCTION IF EXISTS hr_snapshot(text, text);
-- DROP FUNCTION IF EXISTS hr_push(text, text, jsonb, text, int);
-- DROP FUNCTION IF EXISTS hr_leave(text, text);
-- DROP FUNCTION IF EXISTS hr_touch(uuid, text);
-- DROP FUNCTION IF EXISTS hr_public_room(hr_rooms);
-- DROP FUNCTION IF EXISTS hr_seat_of(hr_rooms, text);
-- DROP FUNCTION IF EXISTS hr_new_code();
-- DROP TABLE IF EXISTS hr_rooms;
