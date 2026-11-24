// wa.me deep links — no WhatsApp Business API cost; opens the operator's
// WhatsApp with the message ready to send.
export const waLink = (mobile: string | undefined, text: string) => {
  const digits = (mobile || '').replace(/\D/g, '');
  const to = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
};

export const openWhatsApp = (mobile: string | undefined, text: string) => window.open(waLink(mobile, text), '_blank');
