# tmu-cs

`tmu-cs` は、東京都立大学システムデザイン学部情報科学科向けに調整した Marp テーマです。テーマ CSS だけでなく、Marp custom engine と前処理モジュールを同梱し、以下をまとめて扱えます。

- `tmu-cs` テーマ CSS
- Pandoc citeproc による参考文献処理
- Shiki ベースの C++ コードハイライト
- `annotate` / `step` によるコード注釈
- 数式アノテーション
- Markdown 内の外部コード読み込み

## パッケージ構成

- `theme/tmu-cs.css`: 公開テーマ本体
- `engine.mjs`: Marp custom engine
- `vendor/csl/ieee.csl`: 既定 CSL
- `src/markdown/*`: Markdown 前処理
- `src/shiki/*`: コード注釈パーサ / transformer
- `src/math/annotate-math-block.mjs`: 数式アノテーション
- `src/pandoc/citation-placeholder.lua`: citeproc 補助 filter
- `index.mjs`: 公開 API と各種パス export

公開 API では次を export しています。

- `themeName`
- `themePath`
- `enginePath`
- `defaultCslPath`
- `pandocCitationFilterPath`
- `marpEngine`
- `processCitations`
- `expandStepSlides`
- `resolveExternalCode`
- `collectMathAnnotations`
- `renderAnnotatedMathBlock`
- `createAnnotateTransformer`
- `inspectAnnotatedCodeBlock`
- `parseAnnotateDirective`
- `parseStepDirective`

## インストール

```bash
npm install marp-theme-tmu-cs
```

`pandoc` を使う文献処理を有効にする場合は、別途 `pandoc` が必要です。

## Marp CLI で使う

ローカルインストールした package をそのまま `--theme-set` と `--engine` に渡せます。

```bash
npx marp \
  --theme-set ./node_modules/marp-theme-tmu-cs/theme/tmu-cs.css \
  --engine ./node_modules/marp-theme-tmu-cs/engine.mjs \
  slides.md \
  -o slides.html
```

基本の front matter 例:

```yaml
---
marp: true
theme: tmu-cs
paginate: true
math: mathjax
title: TMU-CS
subtitle: Marp slides with citations and annotations
author: Taishi Nakashima
affiliation: Tokyo Metropolitan University
date: 2026-04-20
bibliography: references.bib
codeLinkLanguages:
  - cpp
---
```

タイトルページは次の順で自動生成します。

- `# {title}`
- `## {subtitle}`
- `### {author}`
- `#### {affiliation}`
- `#### {date}`

`header` を自分で指定しない場合は `title / subtitle` を、`footer` を自分で指定しない場合は `author / date` を既定値として補います。

## 文献引用

Pandoc 互換 citation syntax を使います。

```md
これは引用です [@postel1981ip; @stroustrup2022tour]
```

```yaml
---
bibliography: references.bib
# csl: path/to/style.csl
---
```

既定の引用様式は同梱の `ieee.csl` です。引用文献はスライド下端の脚注領域へ表示し、末尾の `## References` スライドには参考文献一覧を差し込みます。BibTeX に `doi` / `url` がある場合は、参考文献項目へ対応リンクも補います。

Markdown 脚注も同じ下端脚注領域へ流します。

```md
これは脚注の例です [^1]

[^1]: これは補足説明です。
```

## 外部コード読み込み

行全体が standalone の Markdown リンクで、かつ `codeLinkLanguages` で許可した言語だけをコードブロックへ展開します。

```md
[sample.cpp](cpp/sample.cpp)
```

## コード注釈

`cpp` / `c++` fenced code block では Shiki の comment notation と独自 `annotate` / `step` directive を使えます。

```cpp
auto p = std::make_unique<int>(42);
// [!annotate label="unique_ptr生成" note="所有権を unique_ptr が保持する"]
```

```cpp
std::cout << *p << '\n'; // [!step 2 info]
```

## 数式アノテーション

display math 内で行末 `% [!annotate ...]` を使います。

```tex
$$
X_k % [!annotate note="周波数領域の第k成分"]
= \sum_{n=0}^{N-1} % [!annotate note="全サンプルにわたる総和"]
x_n % [!annotate note="離散時間信号"]
\exp\!\left( -2\pi i \frac{kn}{N} \right) % [!annotate note="複素指数基底"]
$$
```

## ローカル開発

```bash
npm install
npm run build:html
npm run build:pdf
npm run build:pptx
npm run watch
```

サンプル入力は `examples/slides.md`、出力は `examples/dist/` です。

## 公開前の確認

```bash
npm pack --dry-run
```

これで npm に含まれるファイルを確認できます。
