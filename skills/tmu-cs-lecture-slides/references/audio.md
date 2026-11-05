# 音声比較

音声はテーマが同梱するwavegramでスペクトログラムを表示する．
`audio.wavesurfer-spectrogram`から生成し，静止スペクトログラム画像で代用しない．
現在の`data-wavegram-*`を入力へ書き，生成後のJSで共通属性を設定し直さない．
古い`data-spectrogram-height`と`data-spectrogram-fft-samples`は互換用として残っている．

複数チャネルは`tmu-cs-audio-list`で縦に並べる．
左右の条件比較は`column-layout`を使い，内部のチャネル順を揃える．
各行のダウンロードは，再生と同じ音声ソースへ接続される．

```html
<div class="tmu-cs-audio-list">
  <audio class="wavesurfer-spectrogram" src="audio/output-0.wav"
    data-audio-label="S0" data-audio-download="output-0.wav"
    data-wavegram-show-waveform="false"
    data-wavegram-show-spectrogram="true"
    data-wavegram-show-controls="false" data-wavegram-show-time="false"
    data-wavegram-color-map="magma"
    data-wavegram-spectrogram-height="160"
    data-wavegram-fft-size="1024" data-wavegram-hop-size="256"
    data-wavegram-min-db="-75" data-wavegram-max-db="-15"></audio>
</div>
```

上の数値は書き方の例であり，比較条件の共通既定ではない．
FFT，hop，窓，dB範囲，表示チャネル，表示高は，個別repoの音声設定へまとめて原稿と揃える．
波形，操作部，時刻を省いた分は，スペクトログラムの表示領域へ割り当てる．
周波数方向の補助線とラベルを隠す場合は，デッキCSSへ指定する．

```css
section { --ap-spectrogram-tick: transparent; }
```

比較音声は同じ解析条件と表示条件を使い，同一の振幅係数を適用する．
音声ごとの独立正規化やチャネルの並べ替えは行わない．
物理音源，保存された生の出力，評価時の対応補正を区別し，出典，抜粋区間，形式，共通ゲイン，hashを個別repoで記録する．
1手法を1ページにするか，どの試聴例を載せるか，対応変化をどう説明するかも個別repoで選ぶ．
描画やクリック位置の不具合は依存先の公開版へ集約し，デッキごとの回避処理を増やさない．

wavegramのUMDはビルド時にHTMLへ埋め込まれる．
依存先を更新した後はデッキを再ビルドする．
宣言バージョンと実際の解決先を区別し，開発用リンクを公開版と報告しない．
テーマの最低依存版wavegram 0.2.1には，`rendering`／`refresh()`による描画最適化が含まれる．
以前の0.2.0では可視時の読み込みは利用できるが，これらの最適化APIは提供されない．
利用中の版の実際のAPIを確認し，公開前の版を新規インストールの前提にしない．
