import { describe, expect, it } from 'vitest';
import { LoginThrottle } from './login-throttle.js';

describe('LoginThrottle', () => {
  it('blocks after the maximum failures and unblocks after the window', () => {
    let now = 0;
    const throttle = new LoginThrottle(3, 1000, () => now);
    for (let i = 0; i < 3; i++) {
      expect(throttle.isBlocked('k')).toBe(false);
      throttle.recordFailure('k');
    }
    expect(throttle.isBlocked('k')).toBe(true);
    expect(throttle.isBlocked('other')).toBe(false);
    now = 1001;
    expect(throttle.isBlocked('k')).toBe(false);
  });

  it('clears on successful login', () => {
    const throttle = new LoginThrottle(1);
    throttle.recordFailure('k');
    throttle.reset('k');
    expect(throttle.isBlocked('k')).toBe(false);
  });
});
