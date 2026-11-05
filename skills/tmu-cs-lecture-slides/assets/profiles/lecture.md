---
marp: true
theme: tmu-cs
paginate: true
math: mathjax
title: IPデータグラム
subtitle: パケットの構造を読む
sectionPages: true
sectionPageLevel: 2
bibliography: ref.bib
citationDisplay: both
footer: 通信の基礎
---

<!-- slide-id: datagram-structure -->
## データグラムの構造

### ヘッダーとデータ

ヘッダーは配送に必要な情報，データ部は運ぶ内容を保持する [@postel1981ip]．

<!--
各フィールドを列挙する前に，ヘッダーとデータ部の役割を分けて説明する．
詳細なフィールドの定義はRFCを参照する．
-->

---

<!-- slide-id: datagram-summary -->
### 要点

- 配送に使う情報と運ぶ内容を分けて読む
- 詳細な定義は原仕様へ戻る

---

### 参考文献

::: {#refs}
:::

---

<!-- paginate: skip -->
<!-- slide-id: reading-details -->
## 補足
<!-- section-page: false -->

### 原仕様を読むとき

フィールドの意味と，送受信時の処理を対応させて読む．
