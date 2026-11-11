import { describe, expect, it } from 'vitest';
import { cleanTranscript, completeLyrics, hebrewLinesOnly, isForeignLine, isPhantom, joinParts, stripPhantomLines } from '../src/core/transcript';

describe('transcript cleaning', () => {
  it('drops the stock phrases Whisper invents over music', () => {
    expect(isPhantom({ text: ' תודה רבה. ' })).toBe(true);
    expect(isPhantom({ text: 'תודה שצפיתם!' })).toBe(true);
    expect(isPhantom({ text: 'כתוביות: מתן כהן' })).toBe(true);
    expect(isPhantom({ text: '...' })).toBe(true);
  });

  it('keeps sung lines, even ones that contain those words', () => {
    expect(isPhantom({ text: 'תודה רבה לגננת שלנו' })).toBe(false);
    expect(isPhantom({ text: 'שלום שלום חברים' })).toBe(false);
  });

  it('drops stretches Whisper itself marks as no speech', () => {
    expect(isPhantom({ text: 'מה', no_speech_prob: 0.9, avg_logprob: -1.4 })).toBe(true);
    expect(isPhantom({ text: 'בוקר טוב', no_speech_prob: 0.9, avg_logprob: -0.3 })).toBe(false);
    // Singing over music: Whisper is unsure, but it is the song.
    expect(isPhantom({ text: 'הנה בא החורף', no_speech_prob: 0.7, avg_logprob: -1.2 })).toBe(false);
  });

  it('keeps the whole song: the transcript wins when the tidy lyrics left a part out', () => {
    const transcript = 'בוקר טוב ילדים\nבוקר טוב גננת\nהשמש זורחת\nוהציפורים שרות\nבוקר טוב לכולם';
    expect(completeLyrics('בוקר טוב ילדים\nבוקר טוב גננת', transcript)).toBe(transcript);
    const tidy = 'בוקר טוב ילדים, בוקר טוב גננת\nהשמש זורחת והציפורים שרות\nבוקר טוב לכולם';
    expect(completeLyrics(tidy, transcript)).toBe(tidy);
    expect(completeLyrics(null, transcript)).toBe(transcript);
    expect(completeLyrics('מילים', null)).toBe('מילים');
    expect(joinParts(['בית ראשון', null, '  ', 'פזמון'])).toBe('בית ראשון\nפזמון');
    expect(joinParts([null])).toBeNull();
  });

  it('builds the lyrics from what is left, one line per segment', () => {
    const res = {
      text: 'בוקר טוב ילדים, בוקר טוב גננת. תודה רבה.',
      segments: [
        { text: ' בוקר טוב ילדים', avg_logprob: -0.3, no_speech_prob: 0.05 },
        { text: ' בוקר טוב גננת', avg_logprob: -0.4, no_speech_prob: 0.1 },
        { text: ' תודה רבה.', avg_logprob: -0.5, no_speech_prob: 0.7 },
      ],
    };
    expect(cleanTranscript(res)).toBe('בוקר טוב ילדים\nבוקר טוב גננת');
    expect(cleanTranscript({ text: 'תודה רבה' })).toBeNull();
    expect(cleanTranscript({ text: 'לה לה לה' })).toBe('לה לה לה');
    expect(cleanTranscript({ segments: [{ text: 'תודה רבה' }] })).toBeNull();
  });

  it('drops loops: repeated text Whisper itself is unsure of, and long runs of one line', () => {
    expect(isPhantom({ text: 'לה לה לה לה לה לה לה', compression_ratio: 3.1, avg_logprob: -1.3 })).toBe(true);
    expect(isPhantom({ text: 'לה לה לה', compression_ratio: 3.1, avg_logprob: -0.2 })).toBe(false);
    const line = (n: number) => Array.from({ length: n }, () => ({ text: 'יום הולדת שמח' }));
    expect(cleanTranscript({ segments: [...line(3), { text: 'לך' }] })).toBe('יום הולדת שמח\nיום הולדת שמח\nיום הולדת שמח\nלך');
    expect(cleanTranscript({ segments: line(9) })?.split('\n')).toHaveLength(4);
  });

  it('cleans lyrics that arrive as plain text', () => {
    expect(stripPhantomLines('שלום שלום\nתודה רבה.\n\n\nלהתראות')).toBe('שלום שלום\n\nלהתראות');
    expect(stripPhantomLines('תודה רבה')).toBeNull();
    expect(stripPhantomLines(null)).toBeNull();
  });
});

describe('Hebrew only (owner, 0.14.0)', () => {
  it('drops lines without a Hebrew letter, keeps Hebrew lines with a foreign word', () => {
    expect(isForeignLine('Good morning, good morning to you')).toBe(true);
    expect(isForeignLine('Доброе утро')).toBe(true);
    expect(isForeignLine('בוקר טוב, good morning')).toBe(false);
    expect(isForeignLine('בוקר טוב לגן')).toBe(false);
    expect(isForeignLine('1, 2, 3 ♪')).toBe(false);
  });

  it('leaves English lines out of a transcript and out of the tidied lyrics', () => {
    expect(cleanTranscript({ segments: [{ text: 'בוקר טוב' }, { text: 'Thank you for watching' }, { text: 'לכל הילדים' }] }))
      .toBe('בוקר טוב\nלכל הילדים');
    expect(stripPhantomLines('בוקר טוב\nGood morning everyone\nלכל הילדים')).toBe('בוקר טוב\nלכל הילדים');
  });

  it('cleans lyrics already in the library (migration v8)', () => {
    expect(hebrewLinesOnly('בוקר טוב\nGood morning\n\nלכל הילדים')).toBe('בוקר טוב\n\nלכל הילדים');
    expect(hebrewLinesOnly('Only English here')).toBeNull();
    expect(hebrewLinesOnly('בוקר טוב')).toBe('בוקר טוב');
  });
});
