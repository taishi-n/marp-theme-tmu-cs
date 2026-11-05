# 用途別の設定

例は[assets/profiles/](../assets/profiles/)にある．
選んだMarkdownと，引用する場合は同じフォルダの`ref.bib`，必要なら`compact.csl`を対象repoへコピーして編集する．
3例とも外部資産の取得なしにHTMLをビルドできる．
言語，章扉，引用方式，フッターは，対象repoの方針に合わせて選び直す．

| 用途 | 作成例 | 章扉 | 引用 | 補足とノート |
| --- | --- | --- | --- | --- |
| 長い講義 | [lecture.md](../assets/profiles/lecture.md) | 全章で有効 | 脚注と末尾一覧 | 詳細はノート，付録は番号から除外 |
| 短い研究発表 | [research-talk.md](../assets/profiles/research-talk.md) | 既定で無効，選んだ章のみ有効 | 短い脚注のみ | 導出はノートか番号なし付録 |
| 実験報告 | [experiment-report.md](../assets/profiles/experiment-report.md) | 無効 | 末尾一覧のみ | 共通条件，検証意図，結果の順 |

各例は`title:`から表紙を自動生成し，`##`を章，`###`を通常ページに使う．
原稿に同じ表紙を重ねて書かない．
独自の表紙が必要な既存デッキは，その`titleSlide`設定と構成を保持する．
実験報告の数値は，明示した4標本の合成信号へ係数を掛けた説明用の値である．
実験の実測結果や性能比較として流用しない．

```sh
npx marp-tmu-cs --html --standalone --slide-index dist/lecture-index.json \
  lecture.md -o dist/lecture.html
npx marp-tmu-cs-check dist/lecture.html --standalone \
  --index dist/lecture-index.json
```

ノートの生成は対象のMarp CLIで`--notes`を使う．
利用repoにノートの整形や出典記録があれば，その処理を保持する．
