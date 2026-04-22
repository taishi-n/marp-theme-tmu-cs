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
header: TMU-CS / Marp slides with citations and annotations
footer: Taishi Nakashima, Tokyo Metropolitan University / 2026-04-20
bibliography: references.bib
---

# 見出し

# h1 header

## h2 header

### h3 header

<!--
見出しの説明
-->

---

<!-- _class: column-layout -->

# 基本文法

<div class="column">

| 項目       | 文法                      | 結果                    |
| :--------- | :------------------------ | :---------------------- |
| 見出し     | `# h1`, `## h2`, `### h3` | 前ページ参照            |
| 太字       | `**太字**`                | **太字** [^1]           |
| 斜体       | `_斜体_`                  | _斜体_                  |
| 取り消し線 | `~~取り消し線~~`          | ~~取り消し線~~          |
| マーカー   | `<mark>ハイライト</mark>` | <mark>ハイライト</mark> |
| 引用       | 行頭で `> `               | 右側参照                |

</div>

<div class="column">

- 番号なしリスト
  - 番号なしリストの入れ子

1. 番号付きリスト
   1. 番号付きリストの入れ子

> 引用の例

</div>

[^1]: テーマカラーは [東京都立大学システムデザイン学部情報科学科](https://cs.sd.tmu.ac.jp) の学科カラーの柚葉色 (`#006543`)．注釈は注釈をする箇所に `text [^1]` のように書き，注釈の内容を任意の箇所に `[^1]: 注釈の例` のように書く．

<!--
Markdown の見た目と出力の対応が最も分かりやすい導入ページです。
-->

---

<!-- _class: column-layout -->

# マルチカラム

<div class="column">

### 左カラム

- 概要
- 背景
- 問題設定

</div>

<div class="column">

### 中央カラム

- 目的
- 手法
- 導出

</div>

<div class="column">

### 右カラム

- 実験条件
- 実験結果
- まとめ

</div>

---

<!-- _class: column-layout -->

# メディア

<div class="column">

- 画像: ![h:130 Bubble Sort](https://upload.wikimedia.org/wikipedia/commons/e/ef/BubbleSort.jpg)
- アニメ: ![h:130 Bubble Sort Animation](https://upload.wikimedia.org/wikipedia/commons/2/2a/Bubble_sort_with_flag.gif)
- 音声: <audio controls src="https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3"></audio>

</div>

<div class="column">

- 音声（スペクトログラム）: <audio class="wavesurfer-spectrogram" controls src="../assets/sine-stereo-440-660.wav" data-spectrogram-height="90" data-spectrogram-fft-samples="2048"></audio>

</div>

<!--
このページでは画像の埋め込みを説明します。
Marp では画像記法に `h:` を付けると、高さを指定して表示サイズを揃えられます。
ここでは外部 URL の JPEG 画像を高さ 200px で表示しています。

このページではアニメーション画像の埋め込みを説明します。
GIF でも同じ `h:` 記法で高さを揃えられるので、静止画と同じ基準でレイアウトできます。
外部 URL と高さ指定だけで差し替えられる点を案内してください。

音声は raw HTML の `audio` 要素で再生でき，`controls` を付けると標準 UI が表示されます。
wavesurfer.js を使ったスペクトログラム表示にも対応しています。
-->

---

# 数式

インライン数式: $e^{i\pi} + 1 = 0$

ディスプレイ数式:

$$
X_k % [!annotate note="周波数領域の第 $k$ 成分"]
=
\sum_{n=0}^{N-1} % [!annotate note="全サンプルにわたる総和"]
x_n % [!annotate note="離散時間信号"]
\exp\!\left( -2\pi i \frac{kn}{N} \right) % [!annotate note="回転因子"]
$$

> #### Eigen vector
>
> Let $V$ be a vector space and $T: V \to V$ a linear transformation. A nonzero vector $v \in V$ is called an eigenvector of $T$ if there exists a scalar $\lambda$ such that $T(v) = \lambda v$.
> The scalar $\lambda$ is called the corresponding eigenvalue.

<!--
このページでは通常の数式記法を説明します。
本文中のインライン数式は `$...$`、独立した式は `$$...$$` です。
Marp の `math: mathjax` を有効にすると、この記法が MathJax で描画されます。

行末の `% [!annotate ...]` が、その行全体をハイライト対象にし、note box と connector を自動配置します。
通常の display math に最小限のコメントを足すだけで使える点を強調してください。

blockquote の 1 行目に `####` 見出しを書くと、見出し帯つきの定義カードとして表示されます。
用語の定義や短い概念説明を本文から分離したいときに使えます。
-->

---

# コードブロック

- [shiki](https://shiki.style) によるシンタックスハイライト
- 外部ファイルの読み込みも対応
  - `[sample.cpp](cpp/sample.cpp)`

```cpp
#include <iostream>
int main() {
    for (int i = 0; i < 5; ++i) { std::cout << i << std::endl; }
    return 0;
}
```

```py
for i in range(5):
    print(i)
```

<!--
コードブロック
シンタックスハイライト
外部コード読み込み
alternative: ``` path="cpp/sample.cpp" fit-height="true" でも外部コードを読み込める
-->

---

# 注釈付きコード

[sample-highlight.cpp](cpp/sample-highlight.cpp)

- C++ では `// [!annotate]`、Python では `# [!annotate]` により注釈を追加可能
  - `highlight`, `focus`, `warning`, `error`, `info` を指定可能

---

# 注釈付きコード2

[sample-highlight.py](python/sample-highlight.py)

<!--
このページではコードハイライト拡張を説明します。
外部ファイル内の `// [!code ...]` / `// [!annotate ...]` や `# [!code ...]` / `# [!annotate ...]` が、強調表示や補足説明に変換されます。
この例では行列とベクトルの積を計算する処理に対して、C++ と Python の両方で `highlight`、`focus`、`warning`、`error`、`info` を使っています。
alternative: ``` path="cpp/sample-highlight.cpp" fit-height="true" や ``` path="python/sample-highlight.py" fit-height="true" も利用できます。
-->

---

# ステップ強調コード

```cpp fit-height="true"
#include <iostream>

int main() {
  const int matrix[2][3] = {{1, 2, 3}, {4, 5, 6}};  // [!step 1 highlight]
  const int vector[3] = {7, 8, 9};                  // [!step 2 highlight]

  for (int row = 0; row < 2; ++row) {                // [!step 3 focus:4]
    const int sum = matrix[row][0] * vector[0]
      + matrix[row][1] * vector[1]                   // [!step 4 warning]
      + matrix[row][2] * vector[2];                  // [!step 5 error]
    std::cout << sum << '\n';                        // [!step 6 info]
  }
}
```

- `// [!step <number> <action>[:N]]` でその行を各ステップで順番に強調可能

---

# 引用

- IP の基本仕様 [@postel1981ip]
- C++ の定番の参考書 [@stroustrup2022tour]

```md
- IP の基本仕様 [@postel1981ip]
- C++ の定番の参考書 [@stroustrup2022tour]
```

<!--
このページでは文献引用の例として、RFC 791 と『A Tour of C++』を参照しています。
`[@key]` を書くと本文中の引用が整形され、同じスライドの脚注と末尾の参考文献一覧へ反映されます。
技術仕様書や書籍のように異なる種類の文献を同じ流れで扱えることを案内してください。
-->

---

# 参考文献

```md
# 参考文献

::: {#refs}
:::
```

::: {#refs}
:::

<!--
このページは参考文献一覧の差し込み位置です。
`# References` 見出しと `::: {#refs}` ブロックを書いておくと、引用した文献が末尾に自動展開されます。
speaker note では bibliography と csl の front matter 設定もあわせて案内してください。
-->

---

# <!--fit--> 高橋<br />メソッド

---

# <!--fit--> 特徴

---

# <!--fit--> 巨大な<br />文字

---

<!-- _class: all-text-center align-center -->

![w:500](../assets/taishi.svg)

Implemented by [OpenAI Codex](https://openai.com/codex/) with prompts from [Taishi Nakashima](https://taishi.org).
Codes are available on [GitHub](https://github.com/taishi-n/marp-theme-tmu-cs)!

<!--
このページでは `all-text-center align-center` による中央配置を説明します。
`all-text-center` でスライド内テキストを中央揃えにし、`align-center` で内容全体を上下中央に寄せています。
画像も本文の一部として中央配置され、プロフィールや短いタイトル付き画像スライドに使えます。
-->
