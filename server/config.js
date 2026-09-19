// Everything the shop owner is likely to change lives here.

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  shop: {
    name: 'M Salon',
    tagline: 'Barbershop',
    owner: 'Mohammed Qasim',
    instagram: 'mohamaqasim',
    phone: '07723163869',
    // Kept in both scripts so the sign outside and the site agree.
    address: {
      en: 'Baghdad - Kadhimiya - next to Reda Alwan',
      ar: 'بغداد - الكاظمية - مجاور رضا علوان'
    },
    mapsQuery: 'رضا علوان الكاظمية بغداد'
  },

  timezone: process.env.SHOP_TIMEZONE || 'Asia/Baghdad',

  price: {
    amount: process.env.PRICE || '25',
    currency: process.env.CURRENCY || 'IQD'
  },

  booking: {
    slotMinutes: num(process.env.SLOT_MINUTES, 30),
    // How far ahead the calendar opens.
    horizonDays: num(process.env.HORIZON_DAYS, 14),
    // A slot stops being bookable this many minutes before it starts.
    leadMinutes: num(process.env.LEAD_MINUTES, 45),
    // One phone number can hold this many upcoming appointments.
    maxPerPhone: num(process.env.MAX_PER_PHONE, 3)
  },

  // 0 = Sunday ... 6 = Saturday. `null` means closed that day.
  hours: {
    0: { open: '11:00', close: '22:00' },
    1: { open: '11:00', close: '22:00' },
    2: { open: '11:00', close: '22:00' },
    3: { open: '11:00', close: '22:00' },
    4: { open: '11:00', close: '22:00' },
    5: { open: '14:00', close: '22:00' },
    6: { open: '11:00', close: '22:00' }
  },

  // Dates the shop is shut regardless of the weekly hours, as YYYY-MM-DD.
  closedDates: [],

  adminKey: process.env.ADMIN_KEY || ''
};

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
