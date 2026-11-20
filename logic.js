/*
  logic.js — الدوال "الحسابية" بتاعة تذكير (من غير أي حاجة تخص الشاشة).
  فصلناها عشان نقدر نختبرها لوحدها وتفضل سهلة القراءة.
  مفيش هنا أي اتصال بالإنترنت.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TazkirLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX = { action: 300, person: 80, trigger: 120, context: 1000 };

  // ---------- نصوص عربي ----------

  // بنوحّد الحروف عشان البحث يلاقي "احمد" لو كاتب "أحمد"، و"مدرسه" لو كاتب "مدرسة".
  function normalizeArabic(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[ً-ٰٟـ]/g, '') // التشكيل والتطويل
      .replace(/[آأإ]/g, 'ا') // أ إ آ -> ا
      .replace(/ى/g, 'ي') // ى -> ي
      .replace(/ة/g, 'ه') // ة -> ه
      .replace(/ک/g, 'ك') // ک -> ك
      .replace(/ی/g, 'ي') // ی -> ي
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/\s+/g, ' ')
      .trim();
  }

  function clip(s, n) {
    return String(s == null ? '' : s).trim().slice(0, n);
  }

  // ---------- تواريخ ----------

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // Date -> "2026-11-20T18:30" (الشكل اللي حقل datetime-local بيفهمه)
  function toLocalInput(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  // "2026-11-20T18:30" -> Date (بتوقيت جهازك) أو null لو الشكل غلط
  function parseLocalInput(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(str || '');
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    return isNaN(d.getTime()) ? null : d;
  }

  function toIso(d) { return d && !isNaN(d.getTime()) ? d.toISOString() : ''; }

  function validIso(s) {
    if (typeof s !== 'string' || !s) return '';
    var d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }

  function addMinutes(d, n) { return new Date(d.getTime() + n * 60000); }

  function tomorrowAt9(base) {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, 9, 0);
  }

  function formatDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try {
      return d.toLocaleString('ar-EG', {
        weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit'
      });
    } catch (e) {
      return toLocalInput(d).replace('T', ' ');
    }
  }

  // ---------- الالتزامات ----------

  function newId() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // بيعمل التزام جديد كامل من اللي اتكتب في الفورم
  function makeItem(draft, now) {
    var nowIso = now.toISOString();
    return {
      id: newId(),
      action: clip(draft.action, MAX.action),
      person: clip(draft.person, MAX.person),
      trigger: clip(draft.trigger, MAX.trigger),
      context: clip(draft.context, MAX.context),
      eventAt: validIso(draft.eventAt),
      remindAt: validIso(draft.remindAt),
      status: 'open',
      createdAt: nowIso,
      updatedAt: nowIso,
      doneAt: ''
    };
  }

  // بينضّف أي التزام جاي من ملف مستورد (مش بنثق في الملف)
  function sanitizeItem(raw, now) {
    if (!raw || typeof raw !== 'object') return null;
    var action = clip(raw.action, MAX.action);
    if (!action) return null;
    var nowIso = now.toISOString();
    var status = raw.status === 'done' ? 'done' : 'open';
    return {
      id: typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 64 ? raw.id : newId(),
      action: action,
      person: clip(raw.person, MAX.person),
      trigger: clip(raw.trigger, MAX.trigger),
      context: clip(raw.context, MAX.context),
      eventAt: validIso(raw.eventAt),
      remindAt: validIso(raw.remindAt),
      status: status,
      createdAt: validIso(raw.createdAt) || nowIso,
      updatedAt: validIso(raw.updatedAt) || validIso(raw.createdAt) || nowIso,
      doneAt: status === 'done' ? (validIso(raw.doneAt) || nowIso) : ''
    };
  }

  // الجملة اللي بتظهر في خطوة "التأكيد"
  function buildSummary(item, fmt) {
    fmt = fmt || formatDateTime;
    var lines = [];
    var main = 'هتعمل «' + item.action + '»';
    if (item.person) main += ' مع ' + item.person;
    if (item.trigger) main += ' — ' + item.trigger;
    lines.push(main);
    if (item.eventAt) lines.push('وقت الحدث (إنت اللي كتبته): ' + fmt(item.eventAt));
    if (item.context) lines.push('السياق: ' + item.context);
    lines.push(item.remindAt ? 'التذكير: ' + fmt(item.remindAt) : 'من غير تذكير');
    return lines;
  }

  function haystack(item) {
    return normalizeArabic([item.action, item.person, item.trigger, item.context].join(' '));
  }

  // كل كلمة في البحث لازم تكون موجودة في أي مكان في الالتزام
  function matchesQuery(item, q) {
    var tokens = normalizeArabic(q).split(' ').filter(Boolean);
    if (!tokens.length) return true;
    var h = haystack(item);
    return tokens.every(function (t) { return h.indexOf(t) !== -1; });
  }

  function samePerson(item, person) {
    if (!person) return true;
    return normalizeArabic(item.person) === normalizeArabic(person);
  }

  function isDue(item, now) {
    return item.status === 'open' && !!item.remindAt && new Date(item.remindAt).getTime() <= now.getTime();
  }

  function sortItems(items, status) {
    var copy = items.slice();
    if (status === 'done') {
      return copy.sort(function (a, b) { return (b.doneAt || '').localeCompare(a.doneAt || ''); });
    }
    return copy.sort(function (a, b) {
      if (a.remindAt && b.remindAt) return a.remindAt.localeCompare(b.remindAt);
      if (a.remindAt) return -1;
      if (b.remindAt) return 1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }

  function filterItems(items, opts) {
    var status = opts.status || 'open';
    var out = items.filter(function (it) {
      return it.status === status && samePerson(it, opts.person) && matchesQuery(it, opts.q || '');
    });
    return sortItems(out, status);
  }

  // قايمة الأشخاص (للاختيار السريع)
  function peopleList(items) {
    var map = {};
    items.forEach(function (it) {
      if (!it.person) return;
      var k = normalizeArabic(it.person);
      if (!map[k]) map[k] = { name: it.person, count: 0 };
      map[k].count++;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      return b.count - a.count || a.name.localeCompare(b.name, 'ar');
    });
  }

  // ---------- تصدير / استيراد ----------

  function exportPayload(items, now) {
    return { app: 'tazkir', version: 1, exportedAt: now.toISOString(), items: items };
  }

  function validateImport(text, now) {
    now = now || new Date();
    var obj;
    try { obj = JSON.parse(text); } catch (e) {
      return { ok: false, items: [], skipped: 0, error: 'الملف مش JSON سليم.' };
    }
    var list = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.items) ? obj.items : null);
    if (!list) return { ok: false, items: [], skipped: 0, error: 'مفيش قايمة التزامات في الملف.' };
    if (!Array.isArray(obj) && obj.app && obj.app !== 'tazkir') {
      return { ok: false, items: [], skipped: 0, error: 'الملف ده مش نسخة احتياطية من تذكير.' };
    }
    var items = [];
    var skipped = 0;
    list.forEach(function (raw) {
      var it = sanitizeItem(raw, now);
      if (it) items.push(it); else skipped++;
    });
    return { ok: true, items: items, skipped: skipped, error: '' };
  }

  // دمج: اللي مش موجود بيتضاف، واللي موجود بنسيب الأحدث
  function mergeItems(existing, incoming) {
    var byId = {};
    existing.forEach(function (it) { byId[it.id] = it; });
    var added = 0, updated = 0;
    incoming.forEach(function (it) {
      var cur = byId[it.id];
      if (!cur) { byId[it.id] = it; added++; }
      else if ((it.updatedAt || '') > (cur.updatedAt || '')) { byId[it.id] = it; updated++; }
    });
    return {
      items: Object.keys(byId).map(function (k) { return byId[k]; }),
      added: added,
      updated: updated
    };
  }

  // بنفكّرك بالنسخة الاحتياطية: لو عدّى أسبوع على آخر تصدير،
  // أو لو عندك التزامات من أكتر من يوم وعمرك ما صدّرت.
  function backupDue(lastExportIso, count, now, days, firstCreatedIso) {
    if (!count) return false;
    if (!lastExportIso) {
      var first = new Date(firstCreatedIso || '').getTime();
      if (isNaN(first)) return false;
      return now.getTime() - first > 86400000;
    }
    var last = new Date(lastExportIso).getTime();
    if (isNaN(last)) return true;
    return now.getTime() - last > (days || 7) * 86400000;
  }

  // ---------- ملف التقويم (.ics) ----------
  // ده الطريقة المضمونة عشان التنبيه يوصلك حتى لو التطبيق مقفول:
  // بتضيف الالتزام لتقويم الموبايل، والتقويم هو اللي بينبّه.

  function icsEscape(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n');
  }

  function utf8Len(cp) {
    if (cp < 0x80) return 1;
    if (cp < 0x800) return 2;
    if (cp < 0x10000) return 3;
    return 4;
  }

  // الـ .ics بيحدد إن السطر ما يزيدش عن 75 بايت، فبنقسّمه
  function foldLine(line) {
    var out = [], cur = '', bytes = 0, ch, b;
    for (var i = 0; i < line.length; ) {
      var cp = line.codePointAt(i);
      ch = String.fromCodePoint(cp);
      i += ch.length;
      b = utf8Len(cp);
      if (bytes + b > 75) { out.push(cur); cur = ' '; bytes = 1; }
      cur += ch;
      bytes += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  function icsLocal(d) {
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + 'T' +
      pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }

  function icsUtc(d) {
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + 'T' +
      pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z';
  }

  function toICS(item, now) {
    if (!item || !item.remindAt) return null;
    var start = new Date(item.remindAt);
    if (isNaN(start.getTime())) return null;
    var end = addMinutes(start, 15);
    var title = 'تذكير: ' + item.action + (item.person ? ' — ' + item.person : '');
    var desc = [];
    if (item.person) desc.push('الشخص: ' + item.person);
    if (item.trigger) desc.push('بعد/لما: ' + item.trigger);
    if (item.context) desc.push('ملاحظة: ' + item.context);
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Tazkir personal prototype//AR',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:' + item.id + '@tazkir.local',
      'DTSTAMP:' + icsUtc(now || new Date()),
      'DTSTART:' + icsLocal(start),
      'DTEND:' + icsLocal(end),
      'SUMMARY:' + icsEscape(title),
      'DESCRIPTION:' + icsEscape(desc.join('\n')),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + icsEscape(title),
      'TRIGGER:PT0S',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ];
    return lines.map(foldLine).join('\r\n') + '\r\n';
  }

  return {
    MAX: MAX,
    normalizeArabic: normalizeArabic,
    pad2: pad2,
    toLocalInput: toLocalInput,
    parseLocalInput: parseLocalInput,
    toIso: toIso,
    validIso: validIso,
    addMinutes: addMinutes,
    tomorrowAt9: tomorrowAt9,
    formatDateTime: formatDateTime,
    newId: newId,
    makeItem: makeItem,
    sanitizeItem: sanitizeItem,
    buildSummary: buildSummary,
    matchesQuery: matchesQuery,
    isDue: isDue,
    sortItems: sortItems,
    filterItems: filterItems,
    peopleList: peopleList,
    exportPayload: exportPayload,
    validateImport: validateImport,
    mergeItems: mergeItems,
    backupDue: backupDue,
    icsEscape: icsEscape,
    foldLine: foldLine,
    toICS: toICS
  };
});
