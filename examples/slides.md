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
codeLinkLanguages:
  - cpp
---

# テーマカラー

- テーマカラー: `#006543`
- 色名: 柚葉色
- 選定理由: 東京都立大学システムデザイン学部情報科学科の学科カラー

<!--
このページでは deck 全体で使っているテーマカラーを説明します。
基調色は `#006543`、色名は柚葉色で、東京都立大学システムデザイン学部情報科学科の学科カラーとして選んでいます。
以降の見出しや強調色、注釈色の基準になっていることを案内してください。
-->

---

# 基本文法

表示例:
通常フォント
**太字**
_強調_
~~取り消し線~~
<mark>ハイライト</mark>

```md
通常フォント
**太字**
_強調_
~~取り消し線~~
<mark>ハイライト</mark>
```

<!--
このページでは最も基本的なテキスト装飾を説明します。
通常テキストはそのまま、太字は `**...**`、強調は `*...*`、取り消し線は `~~...~~` です。
`<mark>...</mark>` は HTML として書けるので、注意喚起や強調色を足したい箇所で使えます。
Markdown の見た目と出力の対応が最も分かりやすい導入ページです。
-->

---

# 見出し

このスライドのタイトル自体が `#` による h1 です。

## h2 見出しの例

### h3 見出しの例

```md
# h1 見出し

## h2 見出し

### h3 見出し
```

<!--
このページでは見出しレベルを説明します。
スライドタイトルの `#` が h1、続く `##` と `###` が h2 と h3 です。
章構造をどう切るかを説明するときに使ってください。
-->

---

# リスト: 番号なし

- Apple
- Banana
- Cherry

```md
- Apple
- Banana
- Cherry
```

<!--
このページでは番号なしリストを説明します。
行頭に `-` を置くと箇条書きになります。
短い要点整理や並列な項目の列挙に向いています。
-->

---

# リスト: 番号付き

1. First step
2. Second step
3. Third step

```md
1. First step
2. Second step
3. Third step
```

<!--
このページでは番号付きリストを説明します。
行頭を `1.` `2.` のように書くと順序付きリストになります。
手順や処理フローの説明に向いています。
-->

---

<!-- _class: column-layout -->

# マルチカラム

<div class="column">

### 左カラム

- 背景
- 問題設定
- 目的

</div>

<div class="column">

### 右カラム

- 手法
- 実験結果
- まとめ

</div>

<div class="column">

```md
<!-- _class: column-layout -->
<div class="column">

### 左カラム

- 背景
- 問題設定
- 目的

</div>

<div class="column">

### 右カラム

- 手法
- 実験結果
- まとめ

</div>
```

</div>

---

# 脚注

これは脚注の例です [^1]

[^1]: これは補足説明をスライド下端に置く脚注のサンプルです。

```md
これは脚注の例です [^1]

[^1]: これは補足説明をスライド下端に置く脚注のサンプルです。
```

<!--
このページでは Markdown 脚注記法を説明します。
`[^1]` と `[^1]: ...` を書くと、脚注本文は参考文献引用と同じくスライド下端の脚注領域へ配置されます。
短い注記や補足説明を本文から分離したいときの使い方として案内してください。
-->

---

# メディア: 画像

![h:260 Bubble Sort](https://upload.wikimedia.org/wikipedia/commons/e/ef/BubbleSort.jpg)

```md
![h:260 Bubble Sort](https://upload.wikimedia.org/wikipedia/commons/e/ef/BubbleSort.jpg)
```

<!--
このページでは画像の埋め込みを説明します。
Marp では画像記法に `h:` を付けると、高さを指定して表示サイズを揃えられます。
ここでは外部 URL の JPEG 画像を高さ 260px で表示しています。
-->

---

# メディア: アニメーション

![h:260 Bubble Sort Animation](https://upload.wikimedia.org/wikipedia/commons/2/2a/Bubble_sort_with_flag.gif)

```md
![h:260 Bubble Sort Animation](https://upload.wikimedia.org/wikipedia/commons/2/2a/Bubble_sort_with_flag.gif)
```

<!--
このページではアニメーション画像の埋め込みを説明します。
GIF でも同じ `h:` 記法で高さを揃えられるので、静止画と同じ基準でレイアウトできます。
外部 URL と高さ指定だけで差し替えられる点を案内してください。
-->

---

# メディア: 音声

ローカルファイル:

<audio controls src="../assets/sine-440hz.wav"></audio>

外部 URL:

<audio controls src="https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3"></audio>

```html
<audio controls src="../assets/sine-440hz.wav"></audio>
<audio
  controls
  src="https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3"
></audio>
```

<!--
このページでは音声メディアの埋め込み例を説明します。
音声は raw HTML の `audio` 要素で再生でき，`controls` を付けると標準 UI が表示されます。
このサンプルでは，ローカル WAV と Web 上の音声 URL の両方を並べて示しています。
-->

---

# メディア: スペクトログラム

<iframe
  class="wavesurfer-spectrogram-frame"
  src="../assets/wavesurfer-spectrogram-demo.html"
  title="wavesurfer.js spectrogram demo"
></iframe>

<!--
このページでは wavesurfer.js と Spectrogram plugin を使った可視化例を説明します。
demo 内では 440Hz のサイン波を生成し，波形とスペクトログラムを表示します。
Marp の本文では `script` タグがそのまま実行されないため，ライブデモは `examples/assets/wavesurfer-spectrogram-demo.html` を `iframe` で埋め込んでいます。
-->

---

# 数式

インライン数式: $e^{i\pi} + 1 = 0$

ディスプレイ数式:

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

```md
インライン数式: $e^{i\pi} + 1 = 0$

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$
```

<!--
このページでは通常の数式記法を説明します。
本文中のインライン数式は `$...$`、独立した式は `$$...$$` です。
Marp の `math: mathjax` を有効にすると、この記法が MathJax で描画されます。
-->

---

# 定義ブロック

> #### ベクトル
>
> 体上のベクトル空間の元であり，成分表示では順序付きのスカラーの組として表されます。

```md
> #### ベクトル
>
> 体上のベクトル空間の元であり，成分表示では順序付きのスカラーの組として表されます。
```

<!--
このページでは definition block スタイルを説明します。
blockquote の 1 行目に `####` 見出しを書くと、見出し帯つきの定義カードとして表示されます。
用語の定義や短い概念説明を本文から分離したいときに使えます。
-->

---

# ハイライト付き数式

$$
X_k % [!annotate note="周波数領域の第 $k$ 成分"]
=
\sum_{n=0}^{N-1} % [!annotate note="全サンプルにわたる総和"]
x_n % [!annotate note="離散時間信号"]
\exp\!\left( -2\pi i \frac{kn}{N} \right) % [!annotate note="回転因子"]
$$

```md
$$
X_k % [!annotate note="周波数領域の第 $k$ 成分"]
=
\sum_{n=0}^{N-1} % [!annotate note="全サンプルにわたる総和"]
x_n % [!annotate note="離散時間信号"]
\exp\!\left( -2\pi i \frac{kn}{N} \right) % [!annotate note="回転因子"]
$$
```

<!--
このページでは数式注釈拡張を説明します。
行末の `% [!annotate ...]` が、その行全体をハイライト対象にし、note box と connector を自動配置します。
通常の display math に最小限のコメントを足すだけで使える点を強調してください。
-->

---

# コード

インラインコード: `std::cout << "Hello";`

```cpp
#include <iostream>

int main() {
  const int matrix[2][3] = {{1, 2, 3}, {4, 5, 6}};
  const int vector[3] = {7, 8, 9};

  for (int row = 0; row < 2; ++row) {
    const int sum = matrix[row][0] * vector[0]
      + matrix[row][1] * vector[1]
      + matrix[row][2] * vector[2];
    std::cout << sum << '\n';
  }
}
```

````md
```cpp
#include <iostream>

int main() {
  const int matrix[2][3] = {{1, 2, 3}, {4, 5, 6}};
  const int vector[3] = {7, 8, 9};

  for (int row = 0; row < 2; ++row) {
    const int sum = matrix[row][0] * vector[0]
      + matrix[row][1] * vector[1]
      + matrix[row][2] * vector[2];
    std::cout << sum << '\n';
  }
}
```
````

<!--
このページでは inline code と通常の fenced code block を説明します。
インラインはバッククォート 1 個、複数行ブロックは triple backticks と言語名です。
この deck では C++ ブロックが Shiki で描画され、例として行列とベクトルの積を計算するコードを載せています。
-->

---

# 外部コード読み込み

```cpp path="cpp/sample.cpp" fit-height="true"

```

````md fit-height="true"
```cpp path="cpp/sample.cpp" fit-height="true"

```
````

<!--
このページでは外部ファイル読み込みを説明します。
`path=` または `src=` 属性付きの fenced code block を使うと、この custom engine が外部ファイルを読み込んでコードブロックとして展開します。
この例では行列とベクトルの積を計算する C++ コードを外部ファイルから読み込んでいます。
-->

---

# 注釈付きコード

```cpp path="cpp/sample-highlight.cpp" fit-height="true"

```

````md fit-height="true"
```cpp path="cpp/sample-highlight.cpp" fit-height="true"

```
````

<!--
このページではコードハイライト拡張を説明します。
外部ファイル内の `// [!code ...]` や `// [!annotate ...]` が、強調表示や補足説明に変換されます。
この例では行列とベクトルの積を計算する処理に対して、`highlight`、`focus`、`warning`、`error`、`info` をすべて使っています。
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

`// [!step <number> <action>[:N]]` を行末に書くと，その行を各ステップで順番に強調できます。

使える `action` は `highlight`, `focus`, `warning`, `error`, `info` です。

---

# 表

<table>
  <thead>
    <tr><th>項目</th><th>書き方の要点</th><th>用途</th></tr>
  </thead>
  <tbody>
    <tr><td>太字</td><td>アスタリスク 2 個で囲む</td><td>強い強調</td></tr>
    <tr><td>数式</td><td>ドル記号で囲む</td><td>インライン数式</td></tr>
    <tr><td>引用</td><td>行頭に &gt; を置く</td><td>引用ブロック</td></tr>
  </tbody>
</table>

```md
| 項目 | 書き方の要点            | 用途           |
| ---- | ----------------------- | -------------- |
| 太字 | アスタリスク 2 個で囲む | 強い強調       |
| 数式 | ドル記号で囲む          | インライン数式 |
| 引用 | 行頭に `>` を置く       | 引用ブロック   |
```

<!--
このページでは Markdown の表記法を説明します。
縦棒 `|` で列を区切り、2 行目の区切り行でヘッダと本文を分けます。
資料の比較表や記法一覧を載せるときに使いやすいことを伝えてください。
-->

---

# 引用

IP の基本仕様は [@postel1981ip] に記述されています。

C++ の概要を確認する参考書として [@stroustrup2022tour] を参照できます。

```md
IP の基本仕様は [@postel1981ip] に記述されています。

C++ の概要を確認する参考書として [@stroustrup2022tour] を参照できます。
```

<!--
このページでは文献引用の例として、RFC 791 と『A Tour of C++』を参照しています。
`[@key]` を書くと本文中の引用が整形され、同じスライドの脚注と末尾の参考文献一覧へ反映されます。
技術仕様書や書籍のように異なる種類の文献を同じ流れで扱えることを案内してください。
-->

---

# <!--fit--> おまけ

---

# <!--fit--> 高橋<br />メソッド

---

# <!--fit--> 特徴

---

# <!--fit--> 巨大な<br />文字

---

# <!--fit--> 簡潔な<br />言葉

---

# References

```md
# References

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

<!-- _class: all-text-center align-center -->

![w:500](../assets/taishi.svg)

Implemented by [OpenAI Codex](https://openai.com/codex/) with prompts from [Taishi Nakashima](https://taishi.org)

<!--
このページでは `all-text-center align-center` による中央配置を説明します。
`all-text-center` でスライド内テキストを中央揃えにし、`align-center` で内容全体を上下中央に寄せています。
画像も本文の一部として中央配置され、プロフィールや短いタイトル付き画像スライドに使えます。
-->
