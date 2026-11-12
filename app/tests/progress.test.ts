import { describe, expect, it } from 'vitest';
import { batchProgress, describeProgress, stageOf } from '../src/core/progress';

const audio = (o: Record<string, unknown> = {}) =>
  ({ kind: 'audio', audioState: 'done', playableUri: 'file:///a.m4a', originalUri: 'file:///a.mp3', error: null, status: 'ready', ...o }) as never;
const raw = audio({ audioState: 'raw', playableUri: null, status: 'pending' });
const naming = audio({ status: 'pending' });
const failed = audio({ audioState: 'unsupported', playableUri: null });
const youtube = { kind: 'youtube', audioState: 'done', playableUri: null, originalUri: null, error: null, status: 'pending' } as never;

describe('progress of songs that came in together (owner, 0.14.1)', () => {
  it('knows each song’s stage', () => {
    expect(stageOf(raw, true)).toBe('preparing');
    expect(stageOf(naming, true)).toBe('naming');
    expect(stageOf(youtube, true)).toBe('naming');
    expect(stageOf(audio(), true)).toBe('ready');
    expect(stageOf(failed, true)).toBe('failed');
    expect(stageOf(audio({ error: 'הוגדר כקובץ פגום' }), true)).toBe('failed');
    // Pending with an error: the services are busy, it will be named later.
    expect(stageOf(audio({ status: 'pending', error: 'המכסה נגמרה' }), true)).toBe('naming');
  });

  it('without an AI service, a playable song is ready: no name is coming', () => {
    expect(stageOf(naming, false)).toBe('ready');
    expect(stageOf(raw, false)).toBe('preparing');
  });

  it('counts the batch and says it', () => {
    const p = batchProgress([raw, naming, youtube, audio(), failed], true);
    expect(p).toEqual({ total: 5, ready: 1, preparing: 1, naming: 2, failed: 1, finished: false });
    expect(describeProgress(p)).toEqual({
      title: 'מכינה 5 שירים',
      detail: '1 מתוך 5 מוכנים · 1 בהכנה לניגון · 2 מקבלים שם ומילים · שיר אחד לא הצליח',
    });
  });

  it('says when it is done', () => {
    expect(describeProgress(batchProgress([audio(), audio()], true))).toEqual({ title: '2 שירים מוכנים', detail: 'אפשר לנגן אותם עכשיו' });
    expect(describeProgress(batchProgress([audio()], true))).toEqual({ title: 'השיר מוכן', detail: 'אפשר לנגן אותו עכשיו' });
    expect(describeProgress(batchProgress([audio(), failed], true)).detail).toBe('שיר אחד לא הצליח · אפשר לנסות שוב מדף השיר');
  });
});
