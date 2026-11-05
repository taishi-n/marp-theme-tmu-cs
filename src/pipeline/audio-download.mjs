/** Point the optional download at the same embedded bytes used for playback. */
export function linkAudioDownload(player, sourceUrl) {
  const link = player.querySelector('[data-audio-download-link]');
  if (link && sourceUrl) link.setAttribute('href', sourceUrl);
}
