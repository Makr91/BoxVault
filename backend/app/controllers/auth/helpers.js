// helpers.js
import { createHash } from 'crypto';

export const generateEmailHash = email =>
  createHash('sha256').update(email.toLowerCase()).digest('hex');
