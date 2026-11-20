/*
  app.js — الجزء اللي بيتعامل مع الشاشة (الأزرار والقوايم).
  الحسابات نفسها في logic.js.
  كل النصوص بتتحط بـ textContent (مش innerHTML) عشان أي نص مستورد ما يقدرش يشغّل كود.
*/
(function () {
  'use strict';

  var L = window.TazkirLogic;
  var KEY = 'tazkir.v1';

  var state = { items: [], lastExportAt: '' };
  var ui = { status: 'open', q: '', person: '', editingId: null, draft: null, storageOk: true, view: 'add' };
  var toastTimer = null;

  // ---------- أدوات صغيرة ----------

  function $(id) { return document.getElementById(id); }

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function fmt(iso) { return L.formatDateTime(iso); }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function arNum(n) {
    try { return Number(n).toLocaleString('ar-EG'); } catch (e) { return String(n); }
  }

  // ---------- التخزين (على الجهاز بس) ----------

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { ui.storageOk = false; return; }
    if (!raw) return;
    try {
      var obj = JSON.parse(raw);
      var v = L.validateImport(JSON.stringify({ items: obj.items }), new Date());
      state.items = v.items;
      state.lastExportAt = typeof obj.lastExportAt === 'string' ? obj.lastExportAt : '';
    } catch (e) {
      // لو الملف اتبوّظ، بنحتفظ بنسخة منه بدل ما نمسحه
      try { localStorage.setItem(KEY + '.corrupt', raw); } catch (e2) { /* ignore */ }
      toast('البيانات المحفوظة كانت بايظة. حفظت نسخة منها وبدأت من جديد.');
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        version: 1, items: state.items, lastExportAt: state.lastExportAt
      }));
      ui.storageOk = true;
    } catch (e) {
      ui.storageOk = false;
      toast('مقدرتش أحفظ على الجهاز. صدّر نسخة احتياطية دلوقتي.');
    }
  }

  function findItem(id) {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i];
    return null;
  }

  // ---------- التنقل بين الشاشات ----------

  function showView(name) {
    ui.view = name;
    ['add', 'list', 'data'].forEach(function (v) { $('view-' + v).hidden = (v !== name); });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-view') === name);
    });
    if (name === 'list') renderList();
    if (name === 'data') renderData();
    window.scrollTo(0, 0);
  }

  // ---------- الفورم ----------

  function readForm() {
    return {
      action: $('f-action').value.trim(),
      person: $('f-person').value.trim(),
      trigger: $('f-trigger').value.trim(),
      context: $('f-context').value.trim(),
      eventAt: L.toIso(L.parseLocalInput($('f-event').value)),
      remindAt: L.toIso(L.parseLocalInput($('f-remind').value))
    };
  }

  function fillForm(it) {
    $('f-action').value = it ? it.action : '';
    $('f-person').value = it ? it.person : '';
    $('f-trigger').value = it ? it.trigger : '';
    $('f-context').value = it ? it.context : '';
    $('f-event').value = it && it.eventAt ? L.toLocalInput(new Date(it.eventAt)) : '';
    $('f-remind').value = it && it.remindAt ? L.toLocalInput(new Date(it.remindAt)) : '';
  }

  function resetForm() {
    ui.editingId = null;
    ui.draft = null;
    fillForm(null);
    $('form-title').textContent = 'التزام جديد';
    $('btn-cancel-edit').hidden = true;
    $('add-form').hidden = false;
    $('review').hidden = true;
  }

  function onQuick(kind) {
    if (kind === 'none') { $('f-remind').value = ''; return; }
    var base = L.parseLocalInput($('f-event').value) || new Date();
    var target = kind === 'm15' ? L.addMinutes(base, 15)
      : kind === 'h1' ? L.addMinutes(base, 60)
      : L.tomorrowAt9(base);
    $('f-remind').value = L.toLocalInput(target);
  }

  // الخطوة "Confirm": بنعرض الجملة اللي التطبيق فهمها قبل الحفظ
  function onSubmit(ev) {
    ev.preventDefault();
    var draft = readForm();
    if (!draft.action) {
      toast('اكتب الالتزام الأول (إيه اللي لازم تعمله؟)');
      $('f-action').focus();
      return;
    }
    ui.draft = draft;

    var box = $('review-lines');
    box.textContent = '';
    L.buildSummary(draft, fmt).forEach(function (line, i) {
      box.appendChild(el('p', { class: i === 0 ? 'main' : '', text: line }));
    });

    var notes = $('review-notes');
    notes.textContent = '';
    if (draft.remindAt) {
      notes.appendChild(el('p', { text: 'التذكير ده هيظهر جوه التطبيق لما تفتحه. لو عايز تنبيه وإنت مقفّله، اضغط «تقويم» على الالتزام بعد الحفظ.' }));
      if (new Date(draft.remindAt).getTime() < Date.now()) {
        notes.appendChild(el('p', { text: 'وقت التذكير ده فات، فهيظهر كمتأخر على طول.' }));
      }
    }
    if (draft.eventAt) {
      notes.appendChild(el('p', { text: 'وقت الحدث إنت اللي كتبته بإيدك. التطبيق مش بيعرف إن الحدث حصل.' }));
    }

    $('add-form').hidden = true;
    $('review').hidden = false;
    window.scrollTo(0, 0);
  }

  function onConfirm() {
    if (!ui.draft) return;
    var now = new Date();
    var nowIso = now.toISOString();
    if (ui.editingId) {
      var it = findItem(ui.editingId);
      if (it) {
        it.action = ui.draft.action; it.person = ui.draft.person; it.trigger = ui.draft.trigger;
        it.context = ui.draft.context; it.eventAt = ui.draft.eventAt; it.remindAt = ui.draft.remindAt;
        it.updatedAt = nowIso;
      }
    } else {
      state.items.push(L.makeItem(ui.draft, now));
    }
    save();
    resetForm();
    ui.status = 'open';
    ui.q = ''; ui.person = ''; $('q').value = '';
    toast('اتحفظ');
    showView('list');
    renderAll();
  }

  function onBack() {
    $('add-form').hidden = false;
    $('review').hidden = true;
  }

  function startEdit(id) {
    var it = findItem(id);
    if (!it) return;
    ui.editingId = id;
    fillForm(it);
    $('form-title').textContent = 'تعديل التزام';
    $('btn-cancel-edit').hidden = false;
    $('add-form').hidden = false;
    $('review').hidden = true;
    showView('add');
  }

  // ---------- أفعال على الالتزام ----------

  function setDone(id, done) {
    var it = findItem(id);
    if (!it) return;
    var nowIso = new Date().toISOString();
    it.status = done ? 'done' : 'open';
    it.doneAt = done ? nowIso : '';
    it.updatedAt = nowIso;
    save();
    renderAll();
  }

  function snooze(id) {
    var it = findItem(id);
    if (!it) return;
    var now = new Date();
    it.remindAt = L.addMinutes(now, 60).toISOString();
    it.updatedAt = now.toISOString();
    save();
    renderAll();
    toast('أجّلت التذكير ساعة');
  }

  function clearReminder(id) {
    var it = findItem(id);
    if (!it) return;
    it.remindAt = '';
    it.updatedAt = new Date().toISOString();
    save();
    renderAll();
  }

  function remove(id) {
    var it = findItem(id);
    if (!it) return;
    if (!window.confirm('تمسح الالتزام ده نهائيًا؟\n«' + it.action + '»')) return;
    state.items = state.items.filter(function (x) { return x.id !== id; });
    save();
    renderAll();
    toast('اتمسح');
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function exportIcs(id) {
    var it = findItem(id);
    if (!it) return;
    var text = L.toICS(it, new Date());
    if (!text) { toast('ضيف وقت تذكير الأول (من تعديل الالتزام)'); return; }
    download('tazkir-' + it.id + '.ics', text, 'text/calendar;charset=utf-8');
    toast('افتح الملف على الموبايل عشان يتضاف للتقويم');
  }

  // ---------- العرض ----------

  function renderCard(it) {
    var now = new Date();
    var due = L.isDue(it, now);
    var li = el('li', { class: 'card' + (it.status === 'done' ? ' done' : '') + (due ? ' due' : '') });
    li.appendChild(el('div', { class: 'card-title', text: it.action }));

    var meta = el('div', { class: 'meta' });
    if (it.person) meta.appendChild(el('span', { class: 'tag', text: 'مع: ' + it.person }));
    if (it.trigger) meta.appendChild(el('span', { class: 'tag', text: it.trigger }));
    if (it.eventAt) meta.appendChild(el('span', { class: 'tag', text: 'وقت الحدث (مكتوب يدويًا): ' + fmt(it.eventAt) }));
    if (it.remindAt) meta.appendChild(el('span', { class: 'tag', text: 'تذكير: ' + fmt(it.remindAt) }));
    if (due) meta.appendChild(el('span', { class: 'tag late', text: 'متأخر' }));
    li.appendChild(meta);

    if (it.context) li.appendChild(el('p', { class: 'ctx', text: it.context }));

    var acts = el('div', { class: 'actions' });
    if (it.status === 'open') {
      acts.appendChild(el('button', { type: 'button', class: 'primary', text: 'تم', onclick: function () { setDone(it.id, true); } }));
      acts.appendChild(el('button', { type: 'button', text: 'تعديل', onclick: function () { startEdit(it.id); } }));
      acts.appendChild(el('button', { type: 'button', text: 'تقويم', onclick: function () { exportIcs(it.id); } }));
    } else {
      acts.appendChild(el('button', { type: 'button', text: 'إعادة فتح', onclick: function () { setDone(it.id, false); } }));
    }
    acts.appendChild(el('button', { type: 'button', class: 'danger', text: 'حذف', onclick: function () { remove(it.id); } }));
    li.appendChild(acts);
    return li;
  }

  function renderList() {
    var open = state.items.filter(function (i) { return i.status === 'open'; }).length;
    $('count-open').textContent = arNum(open);
    $('count-done').textContent = arNum(state.items.length - open);
    $('seg-open').classList.toggle('on', ui.status === 'open');
    $('seg-done').classList.toggle('on', ui.status === 'done');

    // الأشخاص (للاسترجاع السريع)
    var chips = $('people-chips');
    chips.textContent = '';
    var inStatus = state.items.filter(function (i) { return i.status === ui.status; });
    L.peopleList(inStatus).forEach(function (p) {
      var on = L.normalizeArabic(p.name) === L.normalizeArabic(ui.person);
      chips.appendChild(el('button', {
        type: 'button',
        class: 'chip' + (on ? ' on' : ''),
        text: p.name + ' (' + arNum(p.count) + ')',
        onclick: function () { ui.person = on ? '' : p.name; renderList(); }
      }));
    });

    var list = $('list');
    list.textContent = '';
    var shown = L.filterItems(state.items, { status: ui.status, q: ui.q, person: ui.person });
    shown.forEach(function (it) { list.appendChild(renderCard(it)); });

    var empty = $('empty');
    if (!shown.length) {
      empty.hidden = false;
      empty.textContent = state.items.length === 0
        ? 'لسه مفيش التزامات. اضغط «جديد» وسجّل أول واحد.'
        : (ui.q || ui.person ? 'مفيش نتيجة للبحث ده.' : (ui.status === 'open' ? 'مفيش التزامات مفتوحة.' : 'مفيش التزامات خلصت لسه.'));
    } else {
      empty.hidden = true;
    }

    // اقتراحات الأشخاص في الفورم
    var dl = $('people-list');
    dl.textContent = '';
    L.peopleList(state.items).forEach(function (p) { dl.appendChild(el('option', { value: p.name })); });
  }

  function firstCreated() {
    var first = '';
    state.items.forEach(function (i) { if (!first || i.createdAt < first) first = i.createdAt; });
    return first;
  }

  function renderBanners() {
    var box = $('banners');
    box.textContent = '';
    var now = new Date();

    var dueItems = L.sortItems(state.items.filter(function (i) { return L.isDue(i, now); }), 'open');
    dueItems.slice(0, 3).forEach(function (it) {
      var b = el('div', { class: 'banner' });
      b.appendChild(el('strong', { text: 'حان وقت: ' + it.action }));
      var parts = [];
      if (it.person) parts.push('مع ' + it.person);
      if (it.trigger) parts.push(it.trigger);
      if (parts.length) b.appendChild(el('div', { text: parts.join(' — ') }));
      if (it.context) b.appendChild(el('div', { class: 'ctx', text: it.context }));
      var acts = el('div', { class: 'actions' });
      acts.appendChild(el('button', { type: 'button', class: 'primary', text: 'تم', onclick: function () { setDone(it.id, true); } }));
      acts.appendChild(el('button', { type: 'button', text: 'أجّل ساعة', onclick: function () { snooze(it.id); } }));
      acts.appendChild(el('button', { type: 'button', text: 'إلغاء التذكير', onclick: function () { clearReminder(it.id); } }));
      b.appendChild(acts);
      box.appendChild(b);
    });
    if (dueItems.length > 3) {
      box.appendChild(el('div', { class: 'banner info', text: 'وفيه ' + arNum(dueItems.length - 3) + ' كمان متأخرين في «الالتزامات».' }));
    }

    if (!ui.storageOk) {
      box.appendChild(el('div', { class: 'banner', text: 'التخزين على الجهاز مش شغال في المتصفح ده. البيانات ممكن تضيع، صدّر نسخة احتياطية.' }));
    } else if (L.backupDue(state.lastExportAt, state.items.length, now, 7, firstCreated())) {
      var b2 = el('div', { class: 'banner info' });
      b2.appendChild(el('div', { text: 'ماعملتش نسخة احتياطية من فترة. لو البيانات اتمسحت من المتصفح هتضيع.' }));
      var a2 = el('div', { class: 'actions' });
      a2.appendChild(el('button', { type: 'button', text: 'روح لـ «بياناتي»', onclick: function () { showView('data'); } }));
      b2.appendChild(a2);
      box.appendChild(b2);
    }
  }

  function renderData() {
    $('last-export').textContent = state.lastExportAt
      ? 'آخر تصدير: ' + fmt(state.lastExportAt)
      : 'لسه ماصدّرتش نسخة احتياطية.';
    var ps = $('persist-status');
    ps.textContent = '';
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(function (p) {
        ps.textContent = p ? 'المتصفح وافق يحافظ على البيانات.' : 'المتصفح ممكن يمسح البيانات لو المساحة قلّت.';
      }).catch(function () { /* ignore */ });
    }
  }

  // بيحدّث كل حاجة (بعد أي تغيير في البيانات). renderList بيحدّث كمان العدّادات واقتراحات الأسماء.
  function renderAll() {
    renderBanners();
    renderList();
    if (ui.view === 'data') renderData();
  }

  // بيتنفذ كل نص دقيقة: بس التنبيهات، وقايمة الالتزامات لو إنت واقف عليها
  function tick() {
    renderBanners();
    if (ui.view === 'list') renderList();
  }

  // ---------- بياناتي: تصدير واستيراد ومسح ----------

  function dateStamp(d) { return d.getFullYear() + '-' + L.pad2(d.getMonth() + 1) + '-' + L.pad2(d.getDate()); }

  function payloadText() {
    return JSON.stringify(L.exportPayload(state.items, new Date()), null, 2);
  }

  function onExport() {
    download('tazkir-backup-' + dateStamp(new Date()) + '.json', payloadText(), 'application/json');
    state.lastExportAt = new Date().toISOString();
    save();
    renderAll();
    toast('اتصدّر. شوف الملف في التنزيلات.');
  }

  function onCopy() {
    var text = payloadText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        state.lastExportAt = new Date().toISOString();
        save(); renderAll();
        toast('اتنسخ. الصقه في أي مكان تحفظه فيه.');
      }, function () { toast('النسخ مش متاح هنا. جرّب التصدير كملف.'); });
    } else {
      toast('النسخ مش متاح هنا. جرّب التصدير كملف.');
    }
  }

  function importText(text) {
    var v = L.validateImport(text, new Date());
    if (!v.ok) { toast(v.error); return; }
    if (!v.items.length) { toast('مفيش التزامات صالحة في الملف.'); return; }
    var msg = 'هستورد ' + arNum(v.items.length) + ' التزام' + (v.skipped ? ' (وأتجاهل ' + arNum(v.skipped) + ' مش صالحين)' : '') + '.\nاللي عندك دلوقتي هيفضل زي ما هو. أكمل؟';
    if (!window.confirm(msg)) return;
    var m = L.mergeItems(state.items, v.items);
    state.items = m.items;
    save();
    renderAll();
    toast('اتضاف ' + arNum(m.added) + ' وتحدّث ' + arNum(m.updated));
  }

  function onImportFile(ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () { importText(String(r.result || '')); ev.target.value = ''; };
    r.onerror = function () { toast('مقدرتش أقرا الملف.'); };
    r.readAsText(f);
  }

  function onWipe() {
    if (!state.items.length) { toast('مفيش حاجة تتمسح.'); return; }
    if (!window.confirm('هتمسح كل الالتزامات (' + arNum(state.items.length) + ') من الجهاز ده نهائيًا.\nعملت نسخة احتياطية؟ أكمل؟')) return;
    if (!window.confirm('تأكيد أخير: مسح كل حاجة؟')) return;
    state.items = [];
    state.lastExportAt = '';
    try { localStorage.removeItem(KEY); localStorage.removeItem(KEY + '.corrupt'); } catch (e) { /* ignore */ }
    resetForm();
    renderAll();
    toast('اتمسحت كل البيانات.');
  }

  // ---------- تشغيل ----------

  function init() {
    load();

    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.addEventListener('click', function () { showView(b.getAttribute('data-view')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-quick]'), function (b) {
      b.addEventListener('click', function () { onQuick(b.getAttribute('data-quick')); });
    });
    $('add-form').addEventListener('submit', onSubmit);
    $('btn-confirm').addEventListener('click', onConfirm);
    $('btn-back').addEventListener('click', onBack);
    $('btn-cancel-edit').addEventListener('click', function () { resetForm(); showView('list'); });

    $('seg-open').addEventListener('click', function () { ui.status = 'open'; ui.person = ''; renderList(); });
    $('seg-done').addEventListener('click', function () { ui.status = 'done'; ui.person = ''; renderList(); });
    $('q').addEventListener('input', function (e) { ui.q = e.target.value; renderList(); });

    $('btn-export').addEventListener('click', onExport);
    $('btn-copy').addEventListener('click', onCopy);
    $('file-import').addEventListener('change', onImportFile);
    $('btn-import-text').addEventListener('click', function () { importText($('paste-box').value); });
    $('btn-wipe').addEventListener('click', onWipe);

    // طلب تخزين دائم (المتصفح ممكن يرفض، وده عادي)
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }

    // نتأكد من التذكيرات المتأخرة: وقت الفتح، ولما ترجع للتطبيق، وكل نص دقيقة وهو مفتوح
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
    setInterval(tick, 30000);

    renderAll();
    showView(state.items.length ? 'list' : 'add');

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* مش مشكلة لو مش متاح (مثلًا فتح الملف مباشرة) */ });
      });
    }
  }

  init();
})();
