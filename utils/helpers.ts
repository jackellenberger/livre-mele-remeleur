import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export const generateId = () => Math.random().toString(36).substr(2, 9);

export function getFilename(path: string): string {
  // Handle URL
  try {
    const url = new URL(path);
    const pathname = url.pathname;
    return pathname.substring(pathname.lastIndexOf('/') + 1);
  } catch (e) {
    // Handle relative path
    return path.split('/').pop()?.split('?')[0] || 'unknown';
  }
}

export function isFontFile(name: string): boolean {
  return /\.(woff|woff2|ttf|otf|eot)$/i.test(name);
}

export function isImageFile(name: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name);
}