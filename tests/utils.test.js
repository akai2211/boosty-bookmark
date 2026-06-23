import { describe, it, expect } from 'vitest';
import { escapeHtml, formatSeconds, formatSyncDate } from '../src/utils.js';
import { t } from '../src/locales.js';

describe('utils: чистые функции', () => {
  describe('escapeHtml', () => {
    it('экранирует все спецсимволы HTML (& " < >)', () => {
      expect(escapeHtml('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('экранирует амперсанд раньше остальных, не порождая двойного экранирования', () => {
      expect(escapeHtml('a & b')).toBe('a &amp; b');
      expect(escapeHtml('&<')).toBe('&amp;&lt;');
    });

    it('возвращает строку без изменений, если спецсимволов нет', () => {
      expect(escapeHtml('Ванпанчмен 100')).toBe('Ванпанчмен 100');
    });

    it('НЕ экранирует одинарную кавычку (документирует текущее поведение)', () => {
      expect(escapeHtml("O'Brien")).toBe("O'Brien");
    });

    it('приводит не-строки к строке', () => {
      expect(escapeHtml(123)).toBe('123');
      expect(escapeHtml(null)).toBe('null');
      expect(escapeHtml(undefined)).toBe('undefined');
    });
  });

  describe('formatSeconds', () => {
    it('форматирует секунды < часа как M:SS с дополнением нулём', () => {
      expect(formatSeconds(0)).toBe('0:00');
      expect(formatSeconds(5)).toBe('0:05');
      expect(formatSeconds(65)).toBe('1:05');
      expect(formatSeconds(600)).toBe('10:00');
    });

    it('форматирует значения >= часа как H:MM:SS с дополнением минут и секунд', () => {
      expect(formatSeconds(3600)).toBe('1:00:00');
      expect(formatSeconds(3661)).toBe('1:01:01');
      expect(formatSeconds(3903)).toBe('1:05:03');
    });

    it('отбрасывает дробную часть секунд', () => {
      expect(formatSeconds(65.9)).toBe('1:05');
    });

    it('возвращает 0:00 для NaN/null/undefined', () => {
      expect(formatSeconds(NaN)).toBe('0:00');
      expect(formatSeconds(null)).toBe('0:00');
      expect(formatSeconds(undefined)).toBe('0:00');
    });
  });

  describe('formatSyncDate', () => {
    it('возвращает строку «никогда» для пустого таймстампа', () => {
      const never = t('settings_webdav_never_sync');
      expect(formatSyncDate(0)).toBe(never);
      expect(formatSyncDate(null)).toBe(never);
      expect(formatSyncDate(undefined)).toBe(never);
    });

    it('форматирует валидный таймстамп в непустую строку с годом', () => {
      // 15 июня 2024, середина года — год не «съедается» сдвигом таймзоны
      const ts = Date.UTC(2024, 5, 15, 12, 0, 0);
      const result = formatSyncDate(ts);
      expect(typeof result).toBe('string');
      expect(result).not.toBe(t('settings_webdav_never_sync'));
      expect(result).toMatch(/2024/);
    });
  });
});
