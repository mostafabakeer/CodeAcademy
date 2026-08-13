export const ADMIN_WHATSAPP = '201068633486';
export const ADMIN_WHATSAPP_DISPLAY = '+20 106 863 3486';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export function waLink(text?: string): string {
  return `https://wa.me/${ADMIN_WHATSAPP}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
