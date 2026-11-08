import { afterEach, describe, expect, test } from 'vitest';
import { positiveIntegerFromEnv } from './config';

describe('positiveIntegerFromEnv', () => {
  afterEach(() => {
    delete process.env.SEATRUSH_TEST_SETTING;
  });

  test('uses the default when the variable is unset or blank', () => {
    expect(positiveIntegerFromEnv('SEATRUSH_TEST_SETTING', 4)).toBe(4);
    process.env.SEATRUSH_TEST_SETTING = ' ';
    expect(positiveIntegerFromEnv('SEATRUSH_TEST_SETTING', 4)).toBe(4);
  });

  test('reads a positive integer', () => {
    process.env.SEATRUSH_TEST_SETTING = ' 30 ';
    expect(positiveIntegerFromEnv('SEATRUSH_TEST_SETTING', 4)).toBe(30);
  });

  test.each(['abc', '0', '-1', '1.5', '1e400'])('rejects %j', (value) => {
    process.env.SEATRUSH_TEST_SETTING = value;
    expect(() => positiveIntegerFromEnv('SEATRUSH_TEST_SETTING', 4)).toThrow(
      'SEATRUSH_TEST_SETTING must be a positive integer',
    );
  });
});
