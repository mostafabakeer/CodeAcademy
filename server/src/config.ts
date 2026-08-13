import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'drcode_secret_change_me',
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  channelId: process.env.TELEGRAM_CHANNEL_ID || '',
  resyncOnStart: process.env.RESYNC_ON_START === 'true',
  uploadsDir: path.resolve(__dirname, '../uploads'),
  dataDir: path.resolve(__dirname, '../data'),
};
