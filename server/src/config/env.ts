import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env يقع في server/.env — لكن موضع الملف المُجمَّع يختلف بين dev (src) و build (dist)
// لذلك نجرب عدة مسارات مرشّحة ونحمّل أول موجود.
const envCandidates = [
  path.resolve(__dirname, '../../.env'), // src/config → server/.env
  path.resolve(__dirname, '../.env'),    // dist → server/.env
  path.resolve(process.cwd(), '.env'),   // عند التشغيل من داخل server/
  path.resolve(process.cwd(), 'server/.env'), // عند التشغيل من جذر المشروع
];
const envPath = envCandidates.find((p) => fs.existsSync(p));
if (envPath) {
  dotenv.config({ path: envPath, quiet: true });
}

/** يعثر على جذر المشروع (المجلد الذي يحوي client/ و server/) — يعمل في src و dist و docker. */
function detectRootDir(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'client')) && fs.existsSync(path.join(dir, 'server'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`مفقود متغير البيئة المطلوب: ${name} — انسخ server/.env.example إلى server/.env`);
  }
  return v.trim();
}

export interface Env {
  port: number;
  jwtSecret: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  bucketVideos: string;
  bucketImages: string;
  bucketBackups: string;
  botToken: string;
  channelId: string;
  seedOnStart: boolean;
  corsOrigin: string;
  /** جذر المشروع (حيث يقع client/dist) */
  rootDir: string;
}

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const env: Env = {
    port: Number(process.env.PORT || 4000),
    jwtSecret: required('JWT_SECRET'),
    supabaseUrl: required('SUPABASE_URL'),
    supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    bucketVideos: process.env.SUPABASE_BUCKET_VIDEOS?.trim() || 'videos',
    bucketImages: process.env.SUPABASE_BUCKET_IMAGES?.trim() || 'images',
    bucketBackups: process.env.SUPABASE_BUCKET_BACKUPS?.trim() || 'backups',
    botToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || '',
    channelId: process.env.TELEGRAM_CHANNEL_ID?.trim() || '',
    seedOnStart: process.env.SEED_ON_START === 'true',
    corsOrigin: process.env.CORS_ORIGIN?.trim() || '*',
    rootDir: detectRootDir(),
  };
  cached = env;
  return env;
}
