import * as bcrypt from 'npm:bcryptjs@^3.0.2';

export async function hashPassword(plain: string): Promise<string> {
  return await bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return await bcrypt.compare(plain, hash);
}
