import { expect, test } from 'vitest'
import * as util from '../content/shared.js'

// -- clamp ---
test('clamp returns min if val < min', () => {
  expect(util.clamp(0, 1, 10)).toBe(1);
});

test('clamp returns min if val == min', () => {
  expect(util.clamp(1, 1, 10)).toBe(1);
});

test('clamp returns val if min < val < max', () => {
  expect(util.clamp(3, 1, 10)).toBe(3);
});

test('clamp returns max if val == max', () => {
  expect(util.clamp(10, 1, 10)).toBe(10);
});

test('clamp returns max if val > max', () => {
  expect(util.clamp(11, 1, 10)).toBe(10);
});

// -- lerp --
test('lerp returns 0 for minimum', () => {
  expect(util.lerp(0, 0, 100)).toBe(0);
});

test('lerp returns 1 for maximum', () => {
  expect(util.lerp(100, 0, 100)).toBe(1);
});

test('lerp returns 0 for below min', () => {
  expect(util.lerp(-10, 0, 100)).toBe(0);
});

test('lerp returns 1 for above max', () => {
  expect(util.lerp(110, 0, 100)).toBe(1);
});

test('lerp returns .5 for center', () => {
  expect(util.lerp(50, 0, 100)).toBe(0.5);
});

test('lerp returns .5 for center', () => {
  expect(util.lerp(50, 0, 100)).toBe(0.5);
});

test('lerp supports inverted scale min', () => {
  expect(util.lerp(100, 100, 0)).toBe(0);
});

test('lerp supports inverted scale max', () => {
  expect(util.lerp(0, 100, 0)).toBe(1);
});

test('lerp supports rescaled output min', () => {
  expect(util.lerp(0, 0, 100, 50, 60)).toBe(50);
});

test('lerp supports rescaled output max', () => {
  expect(util.lerp(100, 0, 100, 50, 60)).toBe(60);
});

test('lerp supports rescaled output center', () => {
  expect(util.lerp(50, 0, 100, 50, 60)).toBe(55);
});

test('lerp supports rescaled output center (real)', () => {
  expect(util.lerp(50, 0, 100, 0.1, 0.9)).toBe(0.5);
});

test('lerp supports rescaled output (inverted)', () => {
  expect(util.lerp(75, 0, 100, 100, 0)).toBe(25);
});