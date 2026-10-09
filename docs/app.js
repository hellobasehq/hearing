// データの読み書きは Apps Script（ヒアリングページ）の Webアプリに、ログイン情報を付けずに問い合わせる。
// 画面をGoogleの外に置くことで、ブラウザが複数のGoogleアカウントにログインしていても開ける。
var API = 'https://script.google.com/macros/s/AKfycbyaKoN3M58Y8McA8EE3ZA8-_lTRzXzxbLw9amPJGOvMIPkq7wlPBBL_9qbcmb-d6hbg/exec';
var COLORS = ['#1D9E75', '#378ADD', '#1F3A5F', '#D85A30', '#D4537E', '#7F77DD', '#BA7517', '#5F5E5A'];

var CODE = new URLSearchParams(location.search).get('k') || '';
var DATA = null;
var values = {};
var inputs = [];
var KEY = 'hearing-draft-' + CODE;

function el(tag, attrs, text) {
  var e = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) {
    if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
  });
  if (text != null) e.textContent = text;
  return e;
}
function loadDraft() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
function saveDraft() { try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (e) {} }
function clearDraft() { try { localStorage.removeItem(KEY); } catch (e) {} }

function showError(msg) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('pageHearing').style.display = 'none';
  document.getElementById('pageSummary').style.display = 'none';
  if (msg) document.getElementById('errorText').textContent = msg;
  document.getElementById('error').style.display = 'block';
}

function fetchData() {
  return fetch(API + '?p=data&k=' + encodeURIComponent(CODE), { credentials: 'omit', cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (!res.ok) throw new Error('not_found');
      return res.data;
    });
}

// ---- タブ ----
function currentTab() { return location.hash === '#summary' ? 'summary' : 'hearing'; }
function applyTab() {
  if (!DATA) return;
  var tab = currentTab();
  document.getElementById('tabH').classList.toggle('on', tab === 'hearing');
  document.getElementById('tabS').classList.toggle('on', tab === 'summary');
  document.getElementById('pageHearing').style.display = tab === 'hearing' ? 'block' : 'none';
  document.getElementById('pageSummary').style.display = tab === 'summary' ? 'block' : 'none';
  var t = DATA.settings['ページタイトル'] || '';
  document.title = t + (tab === 'summary' ? '｜決定事項まとめ' : '｜ヒアリング');
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', applyTab);

// ---- ヒアリング ----
function renderHearing() {
  document.getElementById('intro').textContent =
    (DATA.settings['宛名'] ? DATA.settings['宛名'] + '\n' : '') + (DATA.settings['案内文'] || '');
  inputs = DATA.items.filter(function (it) { return it.type !== 'info'; });
  var draft = loadDraft();
  inputs.forEach(function (it) {
    var d = DATA.decisions[it.id];
    values[it.id] = draft[it.id] != null ? draft[it.id] : (d && d.status !== '未回答' ? d.latest : '');
  });

  var form = document.getElementById('form');
  form.innerHTML = '';
  var sections = [];
  DATA.items.forEach(function (it) {
    var s = sections[sections.length - 1];
    if (!s || s.name !== it.section) { s = { name: it.section, items: [] }; sections.push(s); }
    s.items.push(it);
  });
  sections.forEach(function (s) {
    form.appendChild(el('h2', null, s.name));
    var infos = s.items.filter(function (it) { return it.type === 'info'; });
    if (infos.length) {
      var det = el('details', { class: 'info' });
      if (infos.length <= 2) det.setAttribute('open', '');
      det.appendChild(el('summary', null, infos.length > 2 ? '内容を見る（' + infos.length + '項目）' : '内容'));
      var body = el('div', { class: 'infobody' });
      infos.forEach(function (it) {
        var box = el('div', { class: 'infoitem' });
        box.appendChild(el('div', { class: 'k' }, it.question));
        box.appendChild(el('div', { class: 'v' }, it.description));
        body.appendChild(box);
      });
      det.appendChild(body);
      form.appendChild(det);
    }
    s.items.filter(function (it) { return it.type !== 'info'; }).forEach(function (it) {
      form.appendChild(renderInput(it));
    });
  });
  updateProgress();
}

function renderInput(it) {
  var card = el('div', { class: 'card', id: 'card-' + it.id });
  var q = el('p', { class: 'q' }, it.question);
  if (it.required) q.appendChild(el('span', { class: 'req' }, '必須'));
  card.appendChild(q);
  if (it.description) card.appendChild(el('p', { class: 'desc' }, it.description));

  if (it.type === 'single' || it.type === 'multi') {
    var current = String(values[it.id] || '').split('\n').filter(String);
    it.options.forEach(function (o) {
      var lab = el('label', { class: 'opt' });
      var inp = el('input', { type: it.type === 'single' ? 'radio' : 'checkbox', name: it.id, value: o.label });
      if (current.indexOf(o.label) >= 0) { inp.checked = true; lab.classList.add('on'); }
      var txt = el('span');
      txt.appendChild(el('span', { class: 'lb' }, o.label));
      if (o.note) txt.appendChild(el('span', { class: 'nt' }, o.note));
      lab.appendChild(inp); lab.appendChild(txt);
      inp.addEventListener('change', function () {
        var picked = [];
        card.querySelectorAll('input').forEach(function (b) {
          b.parentNode.classList.toggle('on', b.checked);
          if (b.checked) picked.push(b.value);
        });
        setValue(it.id, picked.join('\n'));
      });
      card.appendChild(lab);
    });
  } else if (it.type === 'color') {
    var wrap = el('div', { class: 'swatches' });
    var picker = el('input', { type: 'color', 'aria-label': 'ほかの色を選ぶ' });
    picker.style.width = '44px'; picker.style.height = '36px'; picker.style.border = '0'; picker.style.background = 'none';
    var shown = el('span', { class: 'muted' });
    var mark = function (v) {
      wrap.querySelectorAll('.sw').forEach(function (sw) { sw.classList.toggle('on', sw.dataset.c === v); });
      shown.textContent = /^#[0-9a-fA-F]{6}$/.test(v) ? '選んだ色：' + v : '';
      if (/^#[0-9a-fA-F]{6}$/.test(v)) picker.value = v;
    };
    COLORS.forEach(function (c) {
      var sw = el('button', { class: 'sw', type: 'button', 'aria-label': c });
      sw.dataset.c = c; sw.style.background = c;
      sw.addEventListener('click', function () { setValue(it.id, c); free.value = ''; mark(c); });
      wrap.appendChild(sw);
    });
    picker.addEventListener('input', function () { var v = picker.value.toUpperCase(); setValue(it.id, v); free.value = ''; mark(v); });
    wrap.appendChild(picker);
    card.appendChild(wrap);
    card.appendChild(shown);
    var free = el('input', { type: 'text', placeholder: '色の名前やイメージでもかまいません（例：落ち着いた緑）' });
    free.style.marginTop = '10px';
    if (values[it.id] && !/^#[0-9a-fA-F]{6}$/.test(values[it.id])) free.value = values[it.id];
    free.addEventListener('input', function () { setValue(it.id, free.value); mark(''); });
    card.appendChild(free);
    mark(values[it.id] || '');
  } else {
    var f = it.type === 'textarea' ? el('textarea') : el('input', { type: it.type === 'date' ? 'date' : 'text' });
    f.value = values[it.id] || '';
    f.addEventListener('input', function () { setValue(it.id, f.value); });
    card.appendChild(f);
  }
  card.appendChild(el('div', { class: 'err' }, 'こちらの項目は必須です'));
  return card;
}

function setValue(id, v) {
  values[id] = v;
  var card = document.getElementById('card-' + id);
  if (card && v) card.classList.remove('bad');
  saveDraft();
  updateProgress();
}

function updateProgress() {
  var done = inputs.filter(function (it) { return String(values[it.id] || '').trim(); }).length;
  document.getElementById('bar').style.width = Math.round(done / Math.max(inputs.length, 1) * 100) + '%';
  document.getElementById('ptext').textContent = '入力済み ' + done + ' / ' + inputs.length + ' 項目';
}

document.getElementById('send').addEventListener('click', function () {
  var firstBad = null;
  inputs.forEach(function (it) {
    var card = document.getElementById('card-' + it.id);
    var bad = it.required && !String(values[it.id] || '').trim();
    card.classList.toggle('bad', bad);
    if (bad && !firstBad) firstBad = card;
  });
  if (firstBad) { firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }

  var payload = {};
  inputs.forEach(function (it) { if (String(values[it.id] || '').trim()) payload[it.id] = values[it.id]; });
  var btn = this;
  btn.disabled = true; btn.textContent = '送信中…';
  fetch(API, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ k: CODE, answers: payload })
  })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (!res.ok) throw new Error(res.error || '送信できませんでした');
      clearDraft();
      btn.disabled = false; btn.textContent = 'もう一度送信する';
      var box = document.getElementById('done');
      box.textContent = res.result.at + ' に ' + res.result.count + ' 項目を受け付けました。ありがとうございます。内容を確認のうえ、決まったことは「決定事項まとめ」に反映します。';
      box.style.display = 'block';
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return fetchData().then(function (d) { DATA = d; renderSummary(); });
    })
    .catch(function (err) {
      btn.disabled = false; btn.textContent = '送信する';
      alert('送信できませんでした。時間をおいてもう一度お試しください。\n' + (err && err.message ? err.message : ''));
    });
});

// ---- 決定事項まとめ ----
function display(it, raw) {
  var v = String(raw || '').trim();
  if (!v) return null;
  if (it.type === 'single' || it.type === 'multi') {
    return v.split('\n').filter(String).map(function (label) {
      var o = it.options.filter(function (x) { return x.label === label; })[0];
      return o && o.note ? label + '：' + o.note : label;
    }).join('\n');
  }
  if (it.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    var p = v.split('-');
    return Number(p[0]) + '年' + Number(p[1]) + '月' + Number(p[2]) + '日';
  }
  return v;
}

function valueNode(it, text) {
  var v = el('div', { class: 'v' });
  if (it.type === 'color' && /^#[0-9a-fA-F]{6}$/.test(text)) {
    var chip = el('span', { class: 'chip' }); chip.style.background = text; v.appendChild(chip);
  }
  v.appendChild(document.createTextNode(text));
  return v;
}

function renderSummary() {
  var latestDate = '';
  Object.keys(DATA.decisions).forEach(function (k) {
    var d = DATA.decisions[k].updatedAt;
    if (d && d > latestDate) latestDate = d;
  });
  document.getElementById('sub').textContent =
    '今決まっていることと、確認中のことの一覧です。' + (latestDate ? '（最終更新 ' + latestDate + '）' : '');

  var decidedBySection = [];
  var pending = [];
  DATA.items.forEach(function (it) {
    var d = DATA.decisions[it.id] || { status: '未回答', latest: '', decided: '' };
    if (d.status === '決定') {
      var text = display(it, d.decided || d.latest || (it.type === 'info' ? it.description : ''));
      if (!text) return;
      var s = decidedBySection[decidedBySection.length - 1];
      if (!s || s.name !== it.section) { s = { name: it.section, rows: [] }; decidedBySection.push(s); }
      s.rows.push({ it: it, text: text });
    } else {
      pending.push({ it: it, d: d });
    }
  });

  var dec = document.getElementById('decided');
  dec.innerHTML = '';
  dec.appendChild(el('h2', null, '決まっていること'));
  if (!decidedBySection.length) {
    dec.appendChild(el('p', { class: 'muted' }, 'まだ決定した項目はありません。ヒアリングのご回答をもとに、確認のうえこちらに反映します。'));
  }
  decidedBySection.forEach(function (s) {
    var card = el('div', { class: 'card' });
    card.appendChild(el('p', { class: 'q' }, s.name.replace(/^\d+\.\s*/, '')));
    s.rows.forEach(function (r) {
      var row = el('div', { class: 'row' });
      row.appendChild(el('div', { class: 'k' }, r.it.question));
      row.appendChild(valueNode(r.it, r.text));
      card.appendChild(row);
    });
    dec.appendChild(card);
  });

  var pen = document.getElementById('pending');
  pen.innerHTML = '';
  if (pending.length) {
    pen.appendChild(el('h2', null, '確認中のこと'));
    var card = el('div', { class: 'card' });
    pending.forEach(function (p) {
      var row = el('div', { class: 'row' });
      var k = el('div', { class: 'k' }, p.it.question);
      var answered = p.d.status === '回答あり';
      k.appendChild(el('span', { class: 'badge ' + (answered ? 'b-warn' : 'b-none') },
        answered ? (p.it.type === 'info' ? '確認中' : '回答あり・確認中') : '未回答'));
      row.appendChild(k);
      var text = display(p.it, p.d.latest || (p.it.type === 'info' ? p.it.description : ''));
      if (text) row.appendChild(valueNode(p.it, text));
      card.appendChild(row);
    });
    pen.appendChild(card);
  }
}

// ---- 起動 ----
if (!/^[A-Za-z0-9_-]{6,64}$/.test(CODE)) {
  showError();
} else {
  fetchData()
    .then(function (d) {
      DATA = d;
      document.querySelectorAll('.js-title').forEach(function (h) { h.textContent = d.settings['ページタイトル'] || ''; });
      renderHearing();
      renderSummary();
      document.getElementById('loading').style.display = 'none';
      applyTab();
    })
    .catch(function (err) {
      showError(err && err.message === 'not_found'
        ? 'このページは現在ご利用いただけません。URLが正しいかご確認ください。'
        : '読み込みに失敗しました。通信状況をご確認のうえ、ページを再読み込みしてください。');
    });
}
