export const ADMIN_WHATSAPP = '201068633486';
export const ADMIN_WHATSAPP_DISPLAY = '+20 106 863 3486';

export function waLink(text?: string): string {
  return `https://wa.me/${ADMIN_WHATSAPP}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
