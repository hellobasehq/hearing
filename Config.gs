// スクリプトプロパティ（宮田さんが設定する）
//   LEDGER_ID          … ヒアリング台帳のスプシID（setup() が自動で入れる）
//   WEBAPP_URL         … デプロイしたWebアプリのURL（/exec まで）
//   SLACK_WEBHOOK_URL  … 回答があったときの通知先（未設定なら通知しない）

// 公開中のWebアプリ（デプロイID AKfycbyaKoN3…）。WEBAPP_URL を設定すればそちらを優先する
var DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyaKoN3M58Y8McA8EE3ZA8-_lTRzXzxbLw9amPJGOvMIPkq7wlPBBL_9qbcmb-d6hbg/exec';

// お客様に送る画面（GitHub Pages）。台帳のURLはこの形で記録する
var FRONT_URL = 'https://hellobasehq.github.io/hearing/';

var SHEET = {
  ITEMS: '項目',
  ANSWERS: '回答',
  DECISIONS: '決定事項',
  SETTINGS: '設定',
  LEDGER: '顧客'
};

var STATUS = {
  NONE: '未回答',
  ANSWERED: '回答あり',
  DECIDED: '決定'
};

// 項目の種類
//   info     … 説明を見せるだけ（入力なし）
//   single   … 1つ選ぶ
//   multi    … 複数選べる
//   date     … 日付
//   color    … 色
//   text     … 1行の文章
//   textarea … 複数行の文章
var INPUT_TYPES = ['single', 'multi', 'date', 'color', 'text', 'textarea'];

var ITEM_HEADERS = ['ID', 'セクション', '種類', '質問', '説明', '選択肢（1行に1つ。「ラベル｜補足」）', '必須', '表示順'];
var ANSWER_HEADERS = ['送信日時', '項目ID', '質問', '回答'];
var DECISION_HEADERS = ['項目ID', '質問', '最新の回答', '状態', '決定内容（空欄なら最新の回答を使う）', '更新日時'];
var LEDGER_HEADERS = ['コード', 'お客様名', 'スプシURL', 'スプシID', 'ヒアリングURL', 'まとめURL', '作成日', '有効'];

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}
