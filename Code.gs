// Webアプリの入口
//   …/exec?k=<コード>&p=data     データをJSONで返す（GitHub Pages の画面から使う。本番はこちら）
//   …/exec?k=<コード>&p=hearing  ヒアリング（Apps Script上の画面。複数アカウントでログイン中だと開けない）
//   …/exec?k=<コード>&p=summary  決定事項まとめ（同上）
//   POST …/exec  本文 {"k":コード,"answers":{項目ID:値}} を text/plain で送ると回答を保存する
// ※「c」「sid」は Apps Script の予約語なので、コードは「k」で渡す

function doGet(e) {
  var params = (e && e.parameter) || {};
  var code = String(params.k || '').trim();

  if (params.p === 'data') {
    var c = findCustomer_(code);
    if (!c) return json_({ ok: false, error: 'not_found' });
    return json_({ ok: true, data: buildData_(c, code) });
  }

  var page = params.p === 'summary' ? 'summary' : 'hearing';
  var customer = findCustomer_(code);
  if (!customer) {
    return render_('NotFound', { title: 'ページが見つかりません', data: {} });
  }
  var data = buildData_(customer, code);
  var title = (data.settings['ページタイトル'] || customer.name) +
    (page === 'summary' ? '｜決定事項まとめ' : '｜ヒアリング');
  return render_(page === 'summary' ? 'Summary' : 'Hearing', { title: title, data: data });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return json_({ ok: true, result: submitAnswers(body.k, body.answers) });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function buildData_(customer, code) {
  var ss = SpreadsheetApp.openById(customer.sheetId);
  return {
    code: code,
    settings: readSettings_(ss),
    items: readItems_(ss),
    decisions: readDecisions_(ss),
    links: {
      hearing: webappUrl_() + '?k=' + encodeURIComponent(code) + '&p=hearing',
      summary: webappUrl_() + '?k=' + encodeURIComponent(code) + '&p=summary'
    }
  };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ヒアリングページの送信ボタンから呼ばれる
// answers: { 項目ID: 文字列 }
function submitAnswers(code, answers) {
  var customer = findCustomer_(String(code || '').trim());
  if (!customer) throw new Error('このページは現在ご利用いただけません。');
  if (!answers || typeof answers !== 'object') throw new Error('回答が空です。');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.openById(customer.sheetId);
    var items = readItems_(ss);
    var byId = {};
    items.forEach(function (it) { byId[it.id] = it; });

    var now = new Date();
    var rows = [];
    var changed = [];
    Object.keys(answers).forEach(function (id) {
      var item = byId[id];
      if (!item || INPUT_TYPES.indexOf(item.type) < 0) return;
      var value = String(answers[id] == null ? '' : answers[id]).trim().slice(0, 5000);
      if (!value) return;
      rows.push([now, id, item.question, value]);
      changed.push({ id: id, question: item.question, value: value });
    });
    if (!rows.length) throw new Error('入力された内容がありません。');

    var ansSheet = ss.getSheetByName(SHEET.ANSWERS);
    ansSheet.getRange(ansSheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

    updateDecisions_(ss, changed, now);
    notifySlack_(customer, changed);
    return { ok: true, count: changed.length, at: Utilities.formatDate(now, 'Asia/Tokyo', 'M月d日 H:mm') };
  } finally {
    lock.releaseLock();
  }
}

function updateDecisions_(ss, changed, now) {
  var sheet = ss.getSheetByName(SHEET.DECISIONS);
  var last = sheet.getLastRow();
  var values = last > 1 ? sheet.getRange(2, 1, last - 1, DECISION_HEADERS.length).getValues() : [];
  var rowOf = {};
  values.forEach(function (r, i) { rowOf[String(r[0])] = i + 2; });

  changed.forEach(function (c) {
    var row = rowOf[c.id];
    if (!row) {
      sheet.appendRow([c.id, c.question, c.value, STATUS.ANSWERED, '', now]);
      rowOf[c.id] = sheet.getLastRow();
      return;
    }
    var status = String(sheet.getRange(row, 4).getValue());
    sheet.getRange(row, 3).setValue(c.value);
    if (status !== STATUS.DECIDED) sheet.getRange(row, 4).setValue(STATUS.ANSWERED);
    sheet.getRange(row, 6).setValue(now);
  });
}

function notifySlack_(customer, changed) {
  var url = prop_('SLACK_WEBHOOK_URL');
  if (!url) return;
  var lines = changed.slice(0, 10).map(function (c) {
    var v = c.value.length > 60 ? c.value.slice(0, 60) + '…' : c.value;
    return '• ' + c.question + '：' + v;
  });
  if (changed.length > 10) lines.push('…ほか' + (changed.length - 10) + '件');
  var text = '【ヒアリング回答】' + customer.name + ' さんから回答がありました（' + changed.length + '件）\n' +
    lines.join('\n') + '\nスプシ：' + customer.sheetUrl;
  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true
    });
  } catch (err) {
    console.error('Slack通知に失敗: ' + err);
  }
}

// ---- 読み込み ----

function findCustomer_(code) {
  if (!code || !/^[A-Za-z0-9_-]{6,64}$/.test(code)) return null;
  var ledgerId = prop_('LEDGER_ID');
  if (!ledgerId) return null;
  var sheet = SpreadsheetApp.openById(ledgerId).getSheetByName(SHEET.LEDGER);
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var rows = sheet.getRange(2, 1, last - 1, LEDGER_HEADERS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[0]) === code && r[7] !== false && String(r[7]).toUpperCase() !== 'FALSE') {
      return { code: code, name: String(r[1]), sheetUrl: String(r[2]), sheetId: String(r[3]) };
    }
  }
  return null;
}

function readSettings_(ss) {
  var sheet = ss.getSheetByName(SHEET.SETTINGS);
  var out = {};
  if (!sheet || sheet.getLastRow() < 1) return out;
  sheet.getRange(1, 1, sheet.getLastRow(), 2).getValues().forEach(function (r) {
    if (r[0]) out[String(r[0])] = String(r[1]);
  });
  return out;
}

function readItems_(ss) {
  var sheet = ss.getSheetByName(SHEET.ITEMS);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, ITEM_HEADERS.length).getValues()
    .filter(function (r) { return r[0] && r[2]; })
    .map(function (r, i) {
      return {
        id: String(r[0]).trim(),
        section: String(r[1]).trim(),
        type: String(r[2]).trim(),
        question: String(r[3]),
        description: String(r[4]),
        options: String(r[5]).split('\n').map(function (s) { return s.trim(); }).filter(String).map(function (s) {
          var p = s.split('｜');
          return { label: p[0].trim(), note: (p[1] || '').trim() };
        }),
        required: r[6] === true || String(r[6]).toUpperCase() === 'TRUE',
        order: Number(r[7]) || (i + 1)
      };
    })
    .sort(function (a, b) { return a.order - b.order; });
}

function readDecisions_(ss) {
  var sheet = ss.getSheetByName(SHEET.DECISIONS);
  var out = {};
  var last = sheet.getLastRow();
  if (last < 2) return out;
  sheet.getRange(2, 1, last - 1, DECISION_HEADERS.length).getValues().forEach(function (r) {
    if (!r[0]) return;
    out[String(r[0])] = {
      latest: String(r[2]),
      status: String(r[3]) || STATUS.NONE,
      decided: String(r[4]),
      updatedAt: r[5] instanceof Date ? Utilities.formatDate(r[5], 'Asia/Tokyo', 'yyyy/M/d') : ''
    };
  });
  return out;
}

// ---- 表示 ----

function render_(file, model) {
  var t = HtmlService.createTemplateFromFile(file);
  t.title = model.title;
  t.json = JSON.stringify(model.data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return t.evaluate()
    .setTitle(model.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include_(file) {
  return HtmlService.createHtmlOutputFromFile(file).getContent();
}

function webappUrl_() {
  return prop_('WEBAPP_URL') || DEFAULT_WEBAPP_URL || ScriptApp.getService().getUrl();
}
