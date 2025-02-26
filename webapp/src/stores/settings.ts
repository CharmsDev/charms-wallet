import { writable } from 'svelte/store';

const DEFAULT_API_URL = process.env.VITE_CHARMS_API_URL || 'https://api-t4.charms.dev';

// Helper to validate and format API URL
const formatApiUrl = (url: string) => {
    // If it's a full URL (http:// or https://), return as is
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    // Otherwise, assume it's a hostname/path and prepend https://
    return `https://${url}`;
};

// Initialize from localStorage or use default
const storedApiUrl = localStorage.getItem('charmsApiUrl');
const initialUrl = storedApiUrl ? formatApiUrl(storedApiUrl) : DEFAULT_API_URL;

export const apiUrl = writable<string>(initialUrl);

export const saveApiUrl = (value: string) => {
    const formattedUrl = formatApiUrl(value);
    localStorage.setItem('charmsApiUrl', formattedUrl);
    apiUrl.set(formattedUrl);
};
