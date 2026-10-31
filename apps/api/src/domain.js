import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const transitions = {
  created: ['picked_up'],
  picked_up: ['in_transit'],
  in_transit: ['out_for_delivery', 'delayed'],
  out_for_delivery: ['delivered', 'delayed'],
  delayed: ['in_transit'],
  delivered: [],
};
const city = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[\p{L}\p{N} .,'()-]+$/u, 'Use a city name');
export const shipmentInput = z
  .object({
    origin: city,
    destination: city,
    service: z.enum(['standard', 'express']),
    reference: z.string().trim().max(80).default(''),
  })
  .strict();
export const eventInput = z
  .object({
    status: z.enum(Object.keys(transitions)),
    location: city,
    expectedVersion: z.number().int().min(1),
  })
  .strict();
export const trackingPattern = /^PF-[A-F0-9]{16}$/;
export const newTrackingNumber = () => `PF-${randomBytes(8).toString('hex').toUpperCase()}`;
export function tokenMatches(received, expected) {
  if (!received || !expected) return false;
  const hash = (value) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(received), hash(expected));
}
export function canTransition(from, to) {
  return transitions[from]?.includes(to) ?? false;
}
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
