/* ==========================================================================
   themes.js — الثيمات الستة
   --------------------------------------------------------------------------
   القيم منقولة حرفياً من مواصفة التصميم (design_handoff_horoof_game).
   لا تُعدَّل يدوياً بلا تحديث المواصفة معها، وإلا افترق التصميم عن الكود.

   كل ثيم يُطبَّق بكتابة متغيّرات CSS على :root، فيتبدّل كل شيء دفعة واحدة
   بلا إعادة رسم من JavaScript. هذا هو سبب اختيار متغيّرات CSS من الأساس.
   ========================================================================== */

const THEMES = {
  neon: {
    label: 'فحمي نيون', bg: ['#22293A', '#141926', '#080B12'],
    s1: 'rgba(34,41,58,.92)', s2: 'rgba(20,25,38,.92)',
    panel: 'rgba(12,16,26,.62)', panelSolid: 'rgba(28,35,50,.9)',
    inputBg: 'rgba(8,11,18,.85)',
    line: 'rgba(134,239,172,.18)', lineStrong: 'rgba(134,239,172,.5)',
    accent: '#86EFAC', accentLite: '#BBF7D0', accentDeep: '#3FBF7F',
    accentGlow: 'rgba(134,239,172,.55)', onAccent: '#08150E',
    text: '#E8EEF6', head: '#F6FAFF', muted: '#9FAFC4', faint: '#73849B',
    cell: '#ECF2F8', cellText: '#22293A', lock: '#2E3648', lockText: '#73849B',
    overlay: 'rgba(5,8,13,.8)',
    teams: ['#38BDF8', '#F472B6'],
    swatches: ['#38BDF8', '#F472B6', '#86EFAC', '#FDE047', '#C084FC', '#FB923C', '#5EEAD4', '#E2E8F0'],
  },

  ocean: {
    label: 'أزرق محيطي', bg: ['#123A55', '#0A2438', '#05121D'],
    s1: 'rgba(18,58,85,.92)', s2: 'rgba(10,36,56,.92)',
    panel: 'rgba(7,26,40,.62)', panelSolid: 'rgba(12,42,64,.9)',
    inputBg: 'rgba(4,18,29,.85)',
    line: 'rgba(125,211,252,.18)', lineStrong: 'rgba(125,211,252,.5)',
    accent: '#4FB8E8', accentLite: '#8FDCF7', accentDeep: '#2A87B8',
    accentGlow: 'rgba(79,184,232,.65)', onAccent: '#05121D',
    text: '#E7F3FA', head: '#F3FAFE', muted: '#9CBACC', faint: '#6E8A9C',
    cell: '#EAF4FA', cellText: '#123A55', lock: '#27404F', lockText: '#6E8A9C',
    overlay: 'rgba(3,12,20,.78)',
    teams: ['#22D3AE', '#FB7185'],
    swatches: ['#22D3AE', '#FB7185', '#4FB8E8', '#F5C662', '#A78BFA', '#7DD3C0', '#F98A5B', '#E2E8F0'],
  },

  night: {
    label: 'ليلي بنفسجي', bg: ['#2A1F52', '#170F33', '#0B0718'],
    s1: 'rgba(42,31,82,.92)', s2: 'rgba(23,15,51,.92)',
    panel: 'rgba(15,10,33,.62)', panelSolid: 'rgba(33,23,64,.9)',
    inputBg: 'rgba(11,7,24,.85)',
    line: 'rgba(183,156,247,.2)', lineStrong: 'rgba(183,156,247,.52)',
    accent: '#A78BFA', accentLite: '#CFBCFF', accentDeep: '#7C5CD6',
    accentGlow: 'rgba(167,139,250,.6)', onAccent: '#120A26',
    text: '#EFEAFB', head: '#F8F5FF', muted: '#B0A3CE', faint: '#7F739E',
    cell: '#F1ECFC', cellText: '#2A1F52', lock: '#332A4D', lockText: '#7F739E',
    overlay: 'rgba(8,5,18,.8)',
    teams: ['#5EEAD4', '#FDBA74'],
    swatches: ['#5EEAD4', '#FDBA74', '#A78BFA', '#F472B6', '#7DD3FC', '#BEF264', '#FCD34D', '#E5E1F2'],
  },

  clay: {
    label: 'رملي دافئ', bg: ['#3A241B', '#241510', '#130A08'],
    s1: 'rgba(58,36,27,.92)', s2: 'rgba(36,21,16,.92)',
    panel: 'rgba(25,14,10,.62)', panelSolid: 'rgba(50,31,23,.9)',
    inputBg: 'rgba(19,10,8,.85)',
    line: 'rgba(239,169,107,.2)', lineStrong: 'rgba(239,169,107,.52)',
    accent: '#EFA96B', accentLite: '#FFCB99', accentDeep: '#C97D45',
    accentGlow: 'rgba(239,169,107,.6)', onAccent: '#22120C',
    text: '#F7ECE1', head: '#FDF6EE', muted: '#C0A895', faint: '#96806F',
    cell: '#F6E7D5', cellText: '#3A241B', lock: '#41302A', lockText: '#96806F',
    overlay: 'rgba(14,8,6,.8)',
    teams: ['#4FB8A0', '#E05C5C'],
    swatches: ['#4FB8A0', '#E05C5C', '#EFA96B', '#8FB56B', '#6E9BC7', '#D07BB0', '#E8CE7A', '#DCC9B4'],
  },

  berry: {
    label: 'عنابي ملكي', bg: ['#4A1130', '#2C0A1E', '#15040E'],
    s1: 'rgba(74,17,48,.92)', s2: 'rgba(44,10,30,.92)',
    panel: 'rgba(30,6,20,.62)', panelSolid: 'rgba(64,14,42,.9)',
    inputBg: 'rgba(21,4,14,.85)',
    line: 'rgba(255,143,168,.2)', lineStrong: 'rgba(255,143,168,.52)',
    accent: '#FF8FA8', accentLite: '#FFC0CD', accentDeep: '#D95A7A',
    accentGlow: 'rgba(255,143,168,.6)', onAccent: '#26060F',
    text: '#FBEAF0', head: '#FFF4F7', muted: '#CFA5B4', faint: '#A17B89',
    cell: '#FAE9EE', cellText: '#4A1130', lock: '#452433', lockText: '#A17B89',
    overlay: 'rgba(15,4,10,.8)',
    teams: ['#5ED3C0', '#FFB454'],
    swatches: ['#5ED3C0', '#FFB454', '#FF8FA8', '#B79CF7', '#7DB8E8', '#9FD86B', '#F2E6CD', '#EFC7D4'],
  },

  emerald: {
    label: 'أخضر وذهبي', bg: ['#16382F', '#0A231E', '#05130F'],
    s1: 'rgba(19,54,47,.92)', s2: 'rgba(11,36,31,.92)',
    panel: 'rgba(6,26,22,.62)', panelSolid: 'rgba(14,42,36,.9)',
    inputBg: 'rgba(6,24,20,.85)',
    line: 'rgba(232,185,63,.16)', lineStrong: 'rgba(232,185,63,.5)',
    accent: '#E8B93F', accentLite: '#F7D877', accentDeep: '#C9962A',
    accentGlow: 'rgba(232,185,63,.65)', onAccent: '#0A231E',
    text: '#EAF3EF', head: '#F2E6CD', muted: '#8FAAA2', faint: '#6E8A82',
    cell: '#F2E6CD', cellText: '#14332E', lock: '#2A3B37', lockText: '#6E8A82',
    overlay: 'rgba(3,14,11,.78)',
    teams: ['#3FC2A3', '#E8763F'],
    swatches: ['#3FC2A3', '#E8763F', '#E8B93F', '#6EA8E8', '#C77DD8', '#E86A8A', '#8FCF5A', '#D9CFC0'],
  },
};

/* أسماء المتغيّرات في CSS مطابقة لمفاتيح الكائن، عدا ما يحتاج تحويلاً */
function applyTheme(key) {
  const t = THEMES[key] || THEMES.neon;
  const r = document.documentElement.style;

  r.setProperty('--bg0', t.bg[0]);
  r.setProperty('--bg1', t.bg[1]);
  r.setProperty('--bg2', t.bg[2]);

  ['s1', 's2', 'panel', 'panelSolid', 'inputBg', 'line', 'lineStrong',
   'accent', 'accentLite', 'accentDeep', 'accentGlow', 'onAccent',
   'text', 'head', 'muted', 'faint',
   'cell', 'cellText', 'lock', 'lockText', 'overlay'].forEach(k => {
    // panelSolid → --panel-solid
    const cssName = '--' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
    r.setProperty(cssName, t[k]);
  });

  // لون شريط الحالة في التطبيق المثبّت يتبع الثيم
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.bg[1]);

  return t;
}
