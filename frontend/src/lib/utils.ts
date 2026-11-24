import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | undefined): string {
  if (!date) return '—';
  try {
    return format(new Date(date), 'MMM d, yyyy HH:mm');
  } catch {
    return '—';
  }
}

export function formatRelativeDate(date: string | Date | undefined): string {
  if (!date) return '—';
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return '—';
  }
}

export function parseEmailsFromText(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];
  return [...new Set(matches)]; // deduplicate
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'sent': return 'text-green-400 bg-green-400/10 border-green-400/20';
    case 'scheduled': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    case 'failed': return 'text-red-400 bg-red-400/10 border-red-400/20';
    default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  }
}
