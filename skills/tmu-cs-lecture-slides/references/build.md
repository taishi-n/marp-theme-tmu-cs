# 公開機能の使い方

対象が導入しているテーマのバージョンと実体を確認する．
新しい設定の仕様は，その版の`README.md`，`docs/feature-guide.md`，`docs/theme-styling.md`を参照する．
`src/`への直接importや生成後のHTML改変で公開機能を複製しない．
連絡先，出典ハッシュなど個別repoに必要な後処理は，役割を確認して保持する．

## ビルド，CSS，編集用索引

既存Makefileを使う場合は，実行するtargetがブラウザを起動しないことを確認する．
CSSは`slide.css`へ置き，`theme: tmu-cs`のまま正式な追加CSSオプションを使う．

```sh
npx marp-tmu-cs --html --standalone --theme-overrides slide.css \
  --slide-index dist/slide-index.json slide.md -o dist/slide.html
npx marp-tmu-cs-check dist/slide.html --standalone \
  --index dist/slide-index.json --output dist/static-validation.json
```

共有CSSがあれば`--theme-overrides shared.css --theme-overrides slide.css`の順で渡す．
追加CSSへ`@theme`や`@import`を記述しない．
既存の完全な別テーマを使う`--theme-set`とは併用しない．
`--allow-local-files`は，信頼できる既存デッキが入力ディレクトリ外の資産を必要とする場合だけ付ける．

固定IDは`<!-- slide-id: result-example -->`と書く．
生成した章扉やコード状態も，索引の`sourceId`と`sourceLine`から元原稿へ辿れる．
編集ラベルは`--edit-labels`で明示的に有効化し，配布用HTMLでは既定の非表示を使う．
印刷では非表示になる．

静的検証は，重複ID，索引，未解決引用，資産，MathJaxエラーを調べる．
図の重なり，主張の正しさ，音声の聞こえ方，出典hashは検証しない．
これらのうち研究内容と出典は個別repoの検証を併用し，表示確認は利用者へ委ねる．

## 章扉，付録，フッター

章扉は`sectionPages: true/false`で全体を選ぶ．
特定の章だけ変える場合は，対象レベルの章見出しの直後に指定する．

```md
## Acoustic jamming
<!-- section-page: true -->

### Motivation
```

自動章扉はヘッダー，フッター，番号を隠し，本編合計から外れる．
章見出しや元のスライド区切り自体は削除しない．
付録開始時の`<!-- paginate: skip -->`は後続ページにも適用し，番号と本編の合計から外す．
1ページだけの`_paginate: skip`と区別する．
`footer:`で著者，発表先，日付など必要な文字列を指定する．
具体的な内容は個別repoの方針に従う．

## 引用

`bibliography: ref.bib`と`[@key]`を使い，表示先を選ぶ．

| `citationDisplay` | ページの引用脚注 | 末尾の文献一覧 |
| --- | --- | --- |
| `footnotes` | 表示 | 省略 |
| `bibliography` | 省略 | 表示 |
| `both` | 表示 | 表示 |

通常のMarkdown脚注はどのモードでも保持される．
引用数の上限，自著を引用するページは個別repoで定め，多ければ内容を分割する．
BibTeXは完全な書誌情報を保持し，DOIを追加する場合は書誌情報へ解決して重複を除く．
短い引用書式が必要なら，作成例の`compact.csl`をコピーして`csl: compact.csl`と指定する．
この例は著者，掲載先，年を表示し，論文タイトルを省く．
現行エンジンは引用脚注にもCSLのbibliography書式を使うため，`both`では末尾の一覧も同じ短い書式になる．
ページの引用脚注と末尾一覧へ異なるCSLを同時指定する機能はない．
文献一覧の挿入位置は`::: {#refs}`のプレースホルダで指定できる．
生成HTMLから文献ページやタイトル文字列を削除しない．
