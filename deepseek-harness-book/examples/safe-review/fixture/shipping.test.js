import test from 'node:test';
import assert from 'node:assert/strict';
import { shippingFee } from './shipping.js';

test('低于门槛需要运费', () => assert.equal(shippingFee(99), 8));
test('超过门槛免运费', () => assert.equal(shippingFee(101), 0));
