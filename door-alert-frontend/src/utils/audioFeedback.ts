/** 是否允许播放系统提示音（设置页可关闭） */
export function isAlarmSoundEnabled(): boolean {
  return localStorage.getItem('sys_settings_alarm_sound') !== 'false';
}

/**
 * 高危入侵蜂鸣：880Hz 锯齿波
 */
export function playThreatAlarm(durationMs = 450): void {
  if (!isAlarmSoundEnabled()) return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durationMs / 1000);
    osc.start();
    setTimeout(() => {
      try {
        osc.stop();
        audioCtx.close();
      } catch {
        /* ignore */
      }
    }, durationMs);
  } catch {
    /* autoplay 限制忽略 */
  }
}

/**
 * 授权通行轻提示：短促正弦音
 */
export function playPassageChime(): void {
  if (!isAlarmSoundEnabled()) return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.03, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.22);
    osc.start();
    setTimeout(() => {
      try {
        osc.stop();
        audioCtx.close();
      } catch {
        /* ignore */
      }
    }, 240);
  } catch {
    /* ignore */
  }
}
