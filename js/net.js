/* ==========================================================================
   net.js — النقل وحده: الرومات والمزامنة عبر Supabase
   --------------------------------------------------------------------------
   لا يعرف شيئاً عن قواعد اللعبة ولا يلمس الشاشة. يعطي `online.js` ما وصل،
   ويأخذ منه ما يُرسَل.

   ⚠️ **مكتبة Supabase محزومة محلياً وتُحمَّل عند الطلب.**

   محزومة لا من CDN لسببين، أولهما قاطع:
   · **تطبيق iPhone**: بند آبل 2.5.2 يمنع أن ينزّل التطبيق كوداً تنفيذياً
     ويشغّله. جلب مكتبة من jsDelivr وقت التشغيل خطر رفض حقيقي.
   · وأول ضغطة «أونلاين» كانت تنتظر الشبكة (قِيست ~3 ثوانٍ).

   وعند الطلب لا مع الصفحة: اللعبة تعمل بلا إنترنت وهذا وعد معلن في المتجر،
   و211 كيلوبايت تُقرأ وتُفسَّر في كل إقلاع لمن يلعب محلياً هدر خالص.
   ========================================================================== */

const Net = (function () {

  // ⚠️ مسار نسبي لا مطلق: داخل التطبيق الأصل `capacitor://localhost`
  // ولا وجود لخادمنا إطلاقاً.
  const LIB_URL   = 'assets/vendor/supabase.js';
  const URL_BASE  = 'https://rqcltlleqpppeywxbkpo.supabase.co';
  // المفتاح العام منشور عمداً: مصمّم ليُقرأ من المتصفح، والحماية في قاعدة
  // البيانات لا في إخفائه (راجع supabase-huroof.sql).
  const ANON_KEY  = 'sb_publishable_Wtm3EsnJl5CGa8or1egt1g_ZLj_qw6N';

  const TOKEN_KEY   = 'huroof_device_token';
  const NAME_KEY    = 'huroof_player_name';
  const SESSION_KEY = 'huroof_room_session';

  const POLL_MS = 4000;

  let supa = null;
  let room = null;        // آخر صورة من الخادم
  let seat = null;        // مقعدي: 0..7 (0 = المضيف)
  let version = 0;
  let channel = null;
  let pollTimer = null;

  let onUpdate = () => {};
  let onError  = () => {};

  /* ---------------------------------------------------------- الهوية */

  /* توكن الجهاز = عضويتك. يُولَّد مرة ويبقى، فتحديث الصفحة يعيدك لمقعدك
     وفريقك بدل أن يُدخلك لاعباً جديداً.
     ⚠️ `crypto.randomUUID` غير متاحة على http بلا شهادة في بعض المتصفحات،
     والاختبار المحلي يمرّ على http. */
  function token() {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      t = (crypto.randomUUID ? crypto.randomUUID()
        : 'hr-' + Date.now().toString(36) + '-' +
          Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
      localStorage.setItem(TOKEN_KEY, t);
    }
    return t;
  }

  function savedName() { return localStorage.getItem(NAME_KEY) || ''; }
  function rememberName(n) { localStorage.setItem(NAME_KEY, n); }

  function savedSession() { return loadJSON(SESSION_KEY, null); }
  function rememberSession(code) { saveJSON(SESSION_KEY, { code, at: Date.now() }); }
  function forgetSession() { localStorage.removeItem(SESSION_KEY); }

  /* ------------------------------------------------------- المكتبة */

  let libPromise = null;

  function ensureLib() {
    if (window.supabase) return Promise.resolve(true);
    if (libPromise) return libPromise;

    libPromise = new Promise(resolve => {
      const s = document.createElement('script');
      s.src = LIB_URL;
      s.onload = () => resolve(true);
      s.onerror = () => { libPromise = null; resolve(false); };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  async function connect() {
    if (supa) return true;
    if (!(await ensureLib())) return false;
    supa = window.supabase.createClient(URL_BASE, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } }
    });
    return true;
  }

  /* --------------------------------------------------------- النداء */

  async function rpc(fn, args) {
    if (!supa && !(await connect())) return { error: 'offline' };
    try {
      const { data, error } = await supa.rpc(fn, args);
      if (error) {
        console.error('RPC ' + fn + ':', error.message);
        return { error: /function|schema cache/i.test(error.message) ? 'no_schema' : 'network' };
      }
      return data || { error: 'empty' };
    } catch (e) {
      console.error('RPC ' + fn + ' استثناء:', e);
      return { error: 'network' };
    }
  }

  function adopt(data) {
    if (!data || data.error) return data;
    room = data;
    if (typeof data.you === 'number') seat = data.you;
    // نأخذ الأعلى لا الوارد: ردّ متأخر قد يحمل نسخة أقدم مما عندنا
    version = Math.max(version, data.version || 0);
    onUpdate(room);
    return data;
  }

  /* -------------------------------------------------------- الرومات */

  async function createRoom(name) {
    rememberName(name);
    const data = await rpc('hr_create_room', { p_name: name, p_token: token() });
    if (data.error) return data;
    version = 0;
    adopt(data);
    rememberSession(data.code);
    await subscribe(data.code);
    return data;
  }

  async function joinRoom(code, name) {
    rememberName(name);
    const data = await rpc('hr_join_room', {
      p_code: code, p_name: name, p_token: token()
    });
    if (data.error) return data;
    version = data.version || 0;
    adopt(data);
    rememberSession(data.code);
    await subscribe(data.code);
    pingRoster();     // ليرى المضيف من دخل فوراً لا بعد دورة استطلاع
    return data;
  }

  async function resume(code) {
    const data = await rpc('hr_snapshot', { p_code: code, p_token: token() });
    if (data.error) { forgetSession(); return data; }
    version = data.version || 0;
    adopt(data);
    await subscribe(code);
    return data;
  }

  async function setTeam(targetSeat, team) {
    const data = await rpc('hr_set_team', {
      p_code: room && room.code, p_token: token(), p_seat: targetSeat, p_team: team
    });
    if (!data.error) { adopt(data); pingRoster(); }
    return data;
  }

  /* ⚠️ الترتيب مقصود: نخرج من الجدول **ثم** نُشعر، ثم نقطع الاتصال. لو
     أشعرنا أولاً لاستعلم الباقون فوجدونا ما زلنا في الروم، ولو قطعنا
     الاتصال أولاً لما وصلت الإشارة أصلاً. */
  async function leave() {
    const code = room && room.code;
    forgetSession();
    if (code) await rpc('hr_leave', { p_code: code, p_token: token() });
    pingRoster();
    unsubscribe();
    room = null; seat = null; version = 0;
  }

  /* ------------------------------------------------------- الاتصال */

  async function subscribe(code) {
    unsubscribe();

    channel = supa.channel('hr-' + code, { config: { broadcast: { self: false } } });

    channel.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (!payload) return;
      // نسخة أقدم أو مساوية تُهمَل: البثّ قد يصل بغير ترتيبه، وتطبيق
      // القديمة يُرجع المباراة خطوة للوراء أمام اللاعبين
      if ((payload.version || 0) <= version) return;
      version = payload.version;
      room = Object.assign({}, room, payload, { you: seat });
      onUpdate(room);
    });

    /* تغيّر في قائمة اللاعبين. لا نبثّ القائمة نفسها — البثّ لا يُؤتمن على
       الحقائق، ومن يبثّها قد يكذب. نبثّ **إشارة** والطرف الآخر يسأل الخادم. */
    channel.on('broadcast', { event: 'roster' }, () => poll(true));

    await channel.subscribe();

    clearInterval(pollTimer);
    pollTimer = setInterval(poll, POLL_MS);
  }

  function pingRoster() {
    if (channel) channel.send({ type: 'broadcast', event: 'roster', payload: { at: Date.now() } });
  }

  function unsubscribe() {
    clearInterval(pollTimer); pollTimer = null;
    if (channel && supa) { supa.removeChannel(channel); channel = null; }
  }

  /* الاستطلاع يثبت الحضور أيضاً (`hr_snapshot` تكتب `seen`)، فهو نبضة
     ومزامنة في نداء واحد.
     ⚠️ لا نستطلع والصفحة في الخلفية: متصفح الجوال يجمّد المؤقتات، والنداءات
     المتراكمة تنفجر دفعة واحدة عند العودة. و`force` للإشارات وحدها. */
  async function poll(force) {
    if (!room || !room.code) return;
    if (document.hidden && force !== true) return;

    const data = await rpc('hr_snapshot', { p_code: room.code, p_token: token() });
    if (data.error) {
      if (data.error === 'not_found' || data.error === 'not_member') {
        unsubscribe();
        forgetSession();
        onError(data.error);
      }
      return;
    }
    if ((data.version || 0) < version) {
      // عندنا أحدث ممّا في الجدول (بثّ سبق الكتابة) — لا نتراجع
      room = Object.assign({}, data, { state: room.state, version: version, you: seat });
      onUpdate(room);
      return;
    }
    adopt(data);
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  /* ---------------------------------------------------------- الدفع */

  /* نبثّ أولاً ثم نكتب: البثّ هو ما يراه الباقون، والكتابة للبقاء. انتظار
     الكتابة يؤخّر ظهور الحركة عندهم بلا سبب. */
  async function push(state, status) {
    if (!room || !room.code) return;

    version += 1;
    const payload = { state: state, status: status || room.status, version: version };

    room = Object.assign({}, room, payload);
    if (channel) channel.send({ type: 'broadcast', event: 'state', payload: payload });

    const data = await rpc('hr_push', {
      p_code: room.code, p_token: token(),
      p_state: state, p_status: status || '', p_version: version
    });

    // رُفضت لقِدَمها: غيرنا كتب قبلنا. نأخذ نسخته بدل أن نصرّ على نسختنا.
    if (data && !data.error && data.stale) {
      version = data.version || version;
      adopt(data);
    }
  }

  /* ---------------------------------------------------------- قراءة */

  function players() { return (room && room.players) || []; }
  function me() { return players().find(p => p.seat === seat) || null; }

  return {
    ensureLib,
    createRoom, joinRoom, resume, leave, setTeam, push, poll,
    savedName, rememberName, savedSession, forgetSession,

    isOnline() { return !!(room && room.code); },
    room()     { return room; },
    seat()     { return seat; },
    isHost()   { return seat === 0; },
    myTeam()   { const m = me(); return m ? m.team : null; },
    players,
    teamOf(s)  { const p = players().find(x => x.seat === s); return p ? p.team : null; },
    nameOf(s)  { const p = players().find(x => x.seat === s); return p ? p.name : 'لاعب'; },
    teamMembers(t) { return players().filter(p => p.team === t); },

    set onUpdate(fn) { onUpdate = fn; },
    set onError(fn)  { onError = fn; },
  };
})();
