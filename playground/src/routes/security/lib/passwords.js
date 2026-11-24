import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${(await scrypt(pw, salt, 64)).toString('hex')}`;
}

export async function verifyPassword(pw, stored) {
  const [salt, key] = stored.split(':');
  const derived = await scrypt(pw, Buffer.from(salt, 'hex'), 64);
  return crypto.timingSafeEqual(derived, Buffer.from(key, 'hex'));
}
