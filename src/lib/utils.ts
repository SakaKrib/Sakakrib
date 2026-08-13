import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatKES(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

export function validateNationalID(id: string): boolean {
  const cleaned = id.trim().replace(/\s/g, '');
  return /^\d{7,8}$/.test(cleaned);
}

export function validateDL(dl: string): boolean {
  const cleaned = dl.trim().replace(/\s/g, '');
  return /^[A-Za-z0-9]{4,10}$/.test(cleaned);
}

export function validateNumberPlate(plate: string): boolean {
  const cleaned = plate.trim().toUpperCase().replace(/\s+/g, ' ');
  return /^K[A-Z]{2}\s?\d{3}[A-Z]?$/.test(cleaned) || /^K[A-Z]{2}\s?\d{2,3}[A-Z]?$/.test(cleaned);
}

export function validatePhone(phone: string): boolean {
  const cleaned = phone.trim().replace(/\s/g, '');
  return /^(\+?254|0)?7\d{8}$/.test(cleaned) || /^(\+?254|0)?1\d{8}$/.test(cleaned);
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const KENYAN_CITIES = [
  'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Thika', 'Malindi',
  'Kitale', 'Garissa', 'Kakamega', 'Machakos', 'Meru', 'Nyeri', 'Kericho',
  'Embu', 'Voi', 'Kilifi', 'Naivasha', 'Lamu', 'Isiolo',
];

export const KENYAN_COUNTIES = [
  'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Uasin Gishu', 'Kiambu', 'Kilifi',
  'Machakos', 'Kakamega', 'Bungoma', 'Kisii', 'Meru', 'Nyeri', 'Kericho',
  'Embu', 'Kwale', 'Taita-Taveta', 'Garissa', 'Wajir', 'Marsabit',
  'Turkana', 'West Pokot', 'Samburu', 'Laikipia', 'Narok', 'Bomet',
  'Kajiado', 'Tana River', 'Lamu', 'Tana', 'Isiolo', 'Tharaka-Nithi',
  'Nandi', 'Trans Nzoia', 'Elgeyo-Marakwet', 'Uasin', 'Baringo', 'Laikipia',
  'Nyamira', 'Homa Bay', 'Siaya', 'Migori', 'Kisii', 'Vihiga', 'Busia',
];

export const VEHICLE_TYPES = [
  { value: 'pickup', label: 'Pickup Truck' },
  { value: 'lorry', label: 'Lorry / Canter' },
  { value: 'trailer', label: 'Trailer' },
];

export const HOUSE_SIZES = [
  'Bedsitter', 'Single Room', '1 Bedroom', '2 Bedrooms', '3 Bedrooms',
  '4 Bedrooms', '5 Bedrooms', '6+ Bedrooms', 'Studio', 'Custom Size',
];

export const COMMISSION_RATE = 0.10;
export const LISTING_FEE_KES = 1000;
export const FREE_LISTING_LIMIT = 3;

export const DAYS_OF_WEEK = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

export const DAY_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};

export function formatTime(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function getDayOfWeek(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][date.getDay()];
}

export function isMoverAvailable(
  workingDays: string[],
  startTime: string,
  endTime: string,
  dateStr: string,
  pickupTime: string
): { valid: boolean; reason?: string } {
  const day = getDayOfWeek(dateStr);
  if (!workingDays.includes(day)) {
    return { valid: false, reason: `Driver is only available on ${workingDays.join(', ')}.` };
  }
  if (startTime && endTime && pickupTime) {
    if (pickupTime < startTime || pickupTime > endTime) {
      return { valid: false, reason: `Driver works between ${formatTime(startTime)} and ${formatTime(endTime)} on ${day}.` };
    }
  }
  return { valid: true };
}
