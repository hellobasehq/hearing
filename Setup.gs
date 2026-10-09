// 初回だけエディタから実行する：ヒアリング台帳を作る
function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('LEDGER_ID');
  if (id) {
    console.log('台帳は作成済みです: https://docs.google.com/spreadsheets/d/' + id + '/edit');
    return;
  }
  var ss = SpreadsheetApp.create('ヒアリング台帳（ヒアリングページ管理）');
  var sheet = ss.getSheets()[0].setName(SHEET.LEDGER);
  sheet.getRange(1, 1, 1, LEDGER_HEADERS.length).setValues([LEDGER_HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  props.setProperty('LEDGER_ID', ss.getId());
  console.log('台帳を作成しました: ' + ss.getUrl());
}

// お客様ごとのスプシを作り、台帳に登録する
// 使い方：createCustomer('〇〇様', 'romaji') をエディタから実行
function createCustomer(name, prefix) {
  if (!name) throw new Error('お客様名を入れてください');
  var ledgerId = prop_('LEDGER_ID');
  if (!ledgerId) throw new Error('先に setup() を実行してください');

  var code = String(prefix || 'c').replace(/[^A-Za-z0-9]/g, '').toLowerCase().slice(0, 12) + '-' +
    Utilities.getUuid().replace(/-/g, '').slice(0, 12);

  var ss = SpreadsheetApp.create('ヒアリング_' + name);
  var items = ss.getSheets()[0].setName(SHEET.ITEMS);
  items.getRange(1, 1, 1, ITEM_HEADERS.length).setValues([ITEM_HEADERS]).setFontWeight('bold');
  items.setFrozenRows(1);
  items.getRange('C2:C500').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['info'].concat(INPUT_TYPES), true).build());
  items.setColumnWidth(4, 260).setColumnWidth(5, 360).setColumnWidth(6, 360);

  var ans = ss.insertSheet(SHEET.ANSWERS);
  ans.getRange(1, 1, 1, ANSWER_HEADERS.length).setValues([ANSWER_HEADERS]).setFontWeight('bold');
  ans.setFrozenRows(1);

  var dec = ss.insertSheet(SHEET.DECISIONS);
  dec.getRange(1, 1, 1, DECISION_HEADERS.length).setValues([DECISION_HEADERS]).setFontWeight('bold');
  dec.setFrozenRows(1);
  dec.getRange('D2:D500').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList([STATUS.NONE, STATUS.ANSWERED, STATUS.DECIDED], true).build());
  dec.setColumnWidth(2, 260).setColumnWidth(3, 320).setColumnWidth(5, 320);

  var set = ss.insertSheet(SHEET.SETTINGS);
  set.getRange(1, 1, 3, 2).setValues([
    ['ページタイトル', name],
    ['宛名', name],
    ['案内文', 'ご確認・ご記入をお願いします。']
  ]);
  set.setColumnWidth(1, 160).setColumnWidth(2, 480);

  var base = webappUrl_();
  var hearingUrl = base + '?k=' + code + '&p=hearing';
  var summaryUrl = base + '?k=' + code + '&p=summary';
  SpreadsheetApp.openById(ledgerId).getSheetByName(SHEET.LEDGER)
    .appendRow([code, name, ss.getUrl(), ss.getId(), hearingUrl, summaryUrl, new Date(), true]);

  console.log('作成しました\nスプシ: ' + ss.getUrl() + '\nヒアリング: ' + hearingUrl + '\nまとめ: ' + summaryUrl);
  return { code: code, ss: ss, hearingUrl: hearingUrl, summaryUrl: summaryUrl };
}

// 項目タブの内容から、決定事項タブの行をそろえる（項目を足したあとに実行）
function syncDecisionRows(sheetId) {
  var ss = SpreadsheetApp.openById(sheetId);
  var items = readItems_(ss);
  var dec = ss.getSheetByName(SHEET.DECISIONS);
  var existing = readDecisions_(ss);
  var rows = [];
  items.forEach(function (it) {
    if (existing[it.id]) return;
    var isInfo = it.type === 'info';
    rows.push([it.id, it.question, isInfo ? it.description : '', isInfo ? STATUS.ANSWERED : STATUS.NONE, '', new Date()]);
  });
  if (rows.length) dec.getRange(dec.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  console.log('決定事項タブに ' + rows.length + ' 行追加しました');
}

// 台帳のヒアリングURL・まとめURLを今のURL形式で書き直す（URLの形式を変えたあとに実行）
// ※ Apps Script では「c」「sid」がURLの予約語のため、コードは「k=」で渡す
function refreshLedgerUrls() {
  var sheet = SpreadsheetApp.openById(prop_('LEDGER_ID')).getSheetByName(SHEET.LEDGER);
  var last = sheet.getLastRow();
  if (last < 2) return;
  var base = webappUrl_();
  var codes = sheet.getRange(2, 1, last - 1, 1).getValues();
  var urls = codes.map(function (r) {
    var c = String(r[0]);
    return c ? [base + '?k=' + c + '&p=hearing', base + '?k=' + c + '&p=summary'] : ['', ''];
  });
  sheet.getRange(2, 5, urls.length, 2).setValues(urls);
  console.log(urls.length + ' 件のURLを書き直しました');
}
