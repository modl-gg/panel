import test from 'node:test';
import assert from 'node:assert/strict';

import { ApiHttpError, isRetryableHttpError } from './http-error.ts';

test('an http error message carries the status and the response body', () => {
  assert.equal(new ApiHttpError(403, 'Forbidden', 'Insufficient permissions').message, '403: Insufficient permissions');
  assert.equal(new ApiHttpError(403, 'Forbidden', '').message, '403: Forbidden');
});

test('rate limited requests are never retried', () => {
  assert.equal(isRetryableHttpError(new ApiHttpError(429, 'Too Many Requests', 'Rate limit exceeded')), false);
});

test('server errors are retried', () => {
  assert.equal(isRetryableHttpError(new ApiHttpError(500, 'Internal Server Error', '')), true);
  assert.equal(isRetryableHttpError(new ApiHttpError(503, 'Service Unavailable', 'upstream unavailable')), true);
});

test('authorization failures are not retried', () => {
  assert.equal(isRetryableHttpError(new ApiHttpError(403, 'Forbidden', 'Insufficient permissions')), false);
  assert.equal(isRetryableHttpError(new ApiHttpError(401, 'Unauthorized', '')), false);
});

test('failures that carry no response status are treated as network failures and retried', () => {
  assert.equal(isRetryableHttpError(new TypeError('Failed to fetch')), true);
  assert.equal(isRetryableHttpError(new Error('HTTP 403: Forbidden')), true);
  assert.equal(isRetryableHttpError('offline'), true);
});
