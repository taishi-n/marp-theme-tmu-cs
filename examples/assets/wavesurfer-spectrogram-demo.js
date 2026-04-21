(() => {
  const waveSurferUrl = '../assets/vendor/wavesurfer.min.js';
  const spectrogramUrl = '../assets/vendor/spectrogram.min.js';

  function createSineWaveBlob({ frequency = 440, duration = 2, sampleRate = 44100, amplitude = 0.35 } = {}) {
    const sampleCount = Math.max(1, Math.floor(duration * sampleRate));
    const bytesPerSample = 2;
    const channelCount = 1;
    const blockAlign = channelCount * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = sampleCount * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeAscii(offset, value) {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    }

    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channelCount, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeAscii(36, 'data');
    view.setUint32(40, dataSize, true);

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const t = sampleIndex / sampleRate;
      const sample = Math.sin(2 * Math.PI * frequency * t) * amplitude;
      const pcm = Math.max(-1, Math.min(1, sample));
      view.setInt16(44 + sampleIndex * bytesPerSample, Math.round(pcm * 0x7fff), true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') {
          resolve();
          return;
        }

        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
      }, { once: true });
      script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  async function ensureWaveSurfer() {
    if (window.WaveSurfer?.Spectrogram) return window.WaveSurfer;

    await loadScript(waveSurferUrl);
    await loadScript(spectrogramUrl);

    return window.WaveSurfer;
  }

  function updatePlayButton(button, wavesurfer) {
    if (!button) return;
    button.textContent = wavesurfer.isPlaying() ? 'Pause' : 'Play';
  }

  async function initDemo(root) {
    if (!root || root.dataset.wavesurferReady === 'true') return;

    const waveform = root.querySelector('[data-waveform]');
    const spectrogram = root.querySelector('[data-spectrogram]');
    const button = root.querySelector('[data-playpause]');
    const status = root.querySelector('[data-status]');
    if (!waveform || !spectrogram) return;

    root.dataset.wavesurferReady = 'pending';

    try {
      const WaveSurfer = await ensureWaveSurfer();
      const frequency = Number.parseFloat(root.dataset.frequency ?? '440');
      const duration = Number.parseFloat(root.dataset.duration ?? '2');
      const audioBlob = createSineWaveBlob({
        frequency: Number.isFinite(frequency) ? frequency : 440,
        duration: Number.isFinite(duration) ? duration : 2,
      });

      const wavesurfer = WaveSurfer.create({
        container: waveform,
        height: 84,
        waveColor: '#9cc8b5',
        progressColor: '#006543',
        cursorColor: '#1c2520',
        normalize: true,
        plugins: [
          WaveSurfer.Spectrogram.create({
            container: spectrogram,
            height: 140,
            labels: true,
            labelsColor: '#5d6e65',
            labelsHzColor: '#006543',
          }),
        ],
      });

      root.__wavesurfer = wavesurfer;
      wavesurfer.loadBlob(audioBlob);

      if (button) {
        button.disabled = true;
        button.addEventListener('click', () => {
          wavesurfer.playPause();
        });
      }

      wavesurfer.on('ready', () => {
        root.dataset.wavesurferReady = 'true';
        if (status) status.textContent = 'Ready';
        if (button) button.disabled = false;
        updatePlayButton(button, wavesurfer);
      });

      wavesurfer.on('play', () => {
        if (status) status.textContent = 'Playing';
        updatePlayButton(button, wavesurfer);
      });

      wavesurfer.on('pause', () => {
        if (status) status.textContent = 'Paused';
        updatePlayButton(button, wavesurfer);
      });

      wavesurfer.on('finish', () => {
        if (status) status.textContent = 'Finished';
        updatePlayButton(button, wavesurfer);
      });
    } catch (error) {
      root.dataset.wavesurferReady = 'error';
      if (status) status.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  function initAll() {
    document.querySelectorAll('[data-wavesurfer-spectrogram-demo]').forEach((root) => {
      void initDemo(root);
    });
  }

  document.addEventListener('DOMContentLoaded', initAll);

  if (document.readyState !== 'loading') {
    initAll();
  }
})();
