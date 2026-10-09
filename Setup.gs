// お客様ごとのスプシを作る：createCustomer('〇〇様', 'romaji') をエディタから実行
//   スプシ1冊に、項目・回答・決定事項・設定（コード・URL・有効を含む）がすべて入る
function createCustomer(name, prefix) {
  if (!name) throw new Error('お客様名を入れてください');
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

  var set = ss.insertSheet(SHEET.SETTINGS);
  set.getRange(1, 1, 3, 2).setValues([
    ['ページタイトル', name],
    ['宛名', name],
    ['案内文', 'ご確認・ご記入をお願いします。']
  ]);
  writeAdminRows_(ss, code);
  set.setColumnWidth(1, 200).setColumnWidth(2, 520);

  PropertiesService.getScriptProperties().setProperty(CUSTOMER_PREFIX + code, ss.getId());
  console.log('作成しました\nスプシ: ' + ss.getUrl() + '\nお客様用URL: ' + FRONT_URL + '?k=' + code);
  return { code: code, ss: ss, hearingUrl: FRONT_URL + '?k=' + code, summaryUrl: FRONT_URL + '?k=' + code + '#summary' };
}

// 設定タブの下に、管理用の行（コード・URL・有効）を書く。既にあれば値を上書きする
function writeAdminRows_(ss, code) {
  var set = ss.getSheetByName(SHEET.SETTINGS);
  var want = [
    ['コード', code],
    ['お客様用URL', FRONT_URL + '?k=' + code],
    ['まとめURL', FRONT_URL + '?k=' + code + '#summary'],
    ['有効', 'TRUE']
  ];
  var last = set.getLastRow();
  var keys = last ? set.getRange(1, 1, last, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  want.forEach(function (kv) {
    var i = keys.indexOf(kv[0]);
    if (kv[0] === '有効' && i >= 0) return;
    if (i >= 0) set.getRange(i + 1, 2).setValue(kv[1]);
    else { set.appendRow(kv); keys.push(kv[0]); }
  });
}

// 登録されているお客様の一覧をログに出す
function listCustomers() {
  var props = PropertiesService.getScriptProperties().getProperties();
  Object.keys(props).filter(function (k) { return k.indexOf(CUSTOMER_PREFIX) === 0; }).forEach(function (k) {
    var code = k.slice(CUSTOMER_PREFIX.length);
    var url = 'https://docs.google.com/spreadsheets/d/' + props[k] + '/edit';
    console.log(code + '\n  スプシ: ' + url + '\n  お客様用URL: ' + FRONT_URL + '?k=' + code);
  });
}

// 項目タブの内容から、決定事項タブの行をそろえる（ページが開かれたときにも自動で行う）
function syncDecisionRows(sheetId) {
  var n = ensureDecisionRows_(SpreadsheetApp.openById(sheetId));
  console.log('決定事項タブに ' + n + ' 行追加しました');
}

// お客様の回答をすべて消して、未回答の状態に戻す（テストの回答を消すとき）
//   回答タブの行を消し、決定事項タブの入力項目を「未回答」・最新の回答を空欄に戻す（info項目と、決定済みの行は触らない）
function resetAnswers(code) {
  var c = findCustomer_(code);
  if (!c) throw new Error('コードが見つかりません: ' + code);
  var ss = SpreadsheetApp.openById(c.sheetId);
  var types = {};
  readItems_(ss).forEach(function (it) { types[it.id] = it.type; });

  var ans = ss.getSheetByName(SHEET.ANSWERS);
  if (ans.getLastRow() > 1) ans.deleteRows(2, ans.getLastRow() - 1);

  var dec = ss.getSheetByName(SHEET.DECISIONS);
  var last = dec.getLastRow();
  var n = 0;
  if (last > 1) {
    var rows = dec.getRange(2, 1, last - 1, DECISION_HEADERS.length).getValues();
    rows.forEach(function (r) {
      if (types[String(r[0])] && types[String(r[0])] !== 'info' && String(r[3]) !== STATUS.DECIDED) {
        r[2] = ''; r[3] = STATUS.NONE; r[5] = new Date(); n++;
      }
    });
    dec.getRange(2, 1, rows.length, DECISION_HEADERS.length).setValues(rows);
  }
  console.log('回答タブを空にし、決定事項 ' + n + ' 行を未回答に戻しました');
}

// ---- 1回だけ：台帳スプシからの移し替え ----
// 旧「ヒアリング台帳」に登録されているお客様を、スクリプトプロパティに移し、各スプシの設定タブにコード・URLを書く
// 実行後、台帳スプシは使わなくなる（消してよい）
function migrateFromLedger() {
  var ledgerId = prop_('LEDGER_ID');
  if (!ledgerId) { console.log('台帳がありません。移し替えは不要です'); return; }
  var sheet = SpreadsheetApp.openById(ledgerId).getSheetByName(SHEET.LEDGER);
  var last = sheet.getLastRow();
  var props = PropertiesService.getScriptProperties();
  if (last > 1) {
    sheet.getRange(2, 1, last - 1, LEDGER_HEADERS.length).getValues().forEach(function (r) {
      var code = String(r[0]).trim();
      var sheetId = String(r[3]).trim();
      if (!code || !sheetId) return;
      props.setProperty(CUSTOMER_PREFIX + code, sheetId);
      var ss = SpreadsheetApp.openById(sheetId);
      writeAdminRows_(ss, code);
      if (r[7] === false || String(r[7]).toUpperCase() === 'FALSE') {
        var set = ss.getSheetByName(SHEET.SETTINGS);
        var keys = set.getRange(1, 1, set.getLastRow(), 1).getValues().map(function (x) { return String(x[0]); });
        set.getRange(keys.indexOf('有効') + 1, 2).setValue('FALSE');
      }
      console.log('移しました: ' + r[1] + ' ' + code);
    });
  }
  console.log('移し替えが終わりました。台帳スプシ（' + ledgerId + '）は使わなくなりました。新しい版を公開したあと、消してかまいません');
}
