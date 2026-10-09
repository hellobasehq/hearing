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

// 台帳で「お客様名」があり「スプシID」が空の行を見つけて、スプシを作る（エディタから実行）
//   A列（コード）にローマ字を書いておくと、コードの先頭に使う。空なら c-… になる
function createPending() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var sheet = SpreadsheetApp.openById(prop_('LEDGER_ID')).getSheetByName(SHEET.LEDGER);
    var last = sheet.getLastRow();
    if (last < 2) return;
    var rows = sheet.getRange(2, 1, last - 1, LEDGER_HEADERS.length).getValues();
    rows.forEach(function (r, i) {
      var name = String(r[1]).trim();
      if (!name || r[3]) return;
      var made = createCustomerSheet_(name, String(r[0]).trim());
      sheet.getRange(i + 2, 1, 1, LEDGER_HEADERS.length).setValues([[
        made.code, name, made.ss.getUrl(), made.ss.getId(), made.hearingUrl, made.summaryUrl, new Date(), true
      ]]);
      console.log('作成しました: ' + name + ' ' + made.hearingUrl);
    });
  } finally {
    lock.releaseLock();
  }
}

// エディタから直接作るとき：createCustomer('〇〇様', 'romaji')
function createCustomer(name, prefix) {
  if (!name) throw new Error('お客様名を入れてください');
  var ledgerId = prop_('LEDGER_ID');
  if (!ledgerId) throw new Error('先に setup() を実行してください');
  var made = createCustomerSheet_(name, prefix);
  SpreadsheetApp.openById(ledgerId).getSheetByName(SHEET.LEDGER)
    .appendRow([made.code, name, made.ss.getUrl(), made.ss.getId(), made.hearingUrl, made.summaryUrl, new Date(), true]);
  console.log('作成しました\nスプシ: ' + made.ss.getUrl() + '\nヒアリング: ' + made.hearingUrl + '\nまとめ: ' + made.summaryUrl);
  return made;
}

function createCustomerSheet_(name, prefix) {
  var code = (String(prefix || 'c').replace(/[^A-Za-z0-9]/g, '').toLowerCase().slice(0, 12) || 'c') + '-' +
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

  var hearingUrl = FRONT_URL + '?k=' + code;
  var summaryUrl = FRONT_URL + '?k=' + code + '#summary';
  var set = ss.insertSheet(SHEET.SETTINGS);
  set.getRange(1, 1, 4, 2).setValues([
    ['ページタイトル', name],
    ['宛名', name],
    ['案内文', 'ご確認・ご記入をお願いします。'],
    ['お客様用URL（参考・表示されません）', hearingUrl]
  ]);
  set.setColumnWidth(1, 220).setColumnWidth(2, 480);

  return { code: code, ss: ss, hearingUrl: hearingUrl, summaryUrl: summaryUrl };
}

// 項目タブの内容から、決定事項タブの行をそろえる（ページが開かれたときにも自動で行う）
function syncDecisionRows(sheetId) {
  var n = ensureDecisionRows_(SpreadsheetApp.openById(sheetId));
  console.log('決定事項タブに ' + n + ' 行追加しました');
}

// 台帳のヒアリングURL・まとめURLを今のURL形式で書き直す（URLの形式を変えたあとに実行）
// ※ Apps Script では「c」「sid」がURLの予約語のため、コードは「k=」で渡す
function refreshLedgerUrls() {
  var sheet = SpreadsheetApp.openById(prop_('LEDGER_ID')).getSheetByName(SHEET.LEDGER);
  var last = sheet.getLastRow();
  if (last < 2) return;
  var codes = sheet.getRange(2, 1, last - 1, 1).getValues();
  var urls = codes.map(function (r) {
    var c = String(r[0]);
    return c ? [FRONT_URL + '?k=' + c, FRONT_URL + '?k=' + c + '#summary'] : ['', ''];
  });
  sheet.getRange(2, 5, urls.length, 2).setValues(urls);
  console.log(urls.length + ' 件のURLを書き直しました');
}
