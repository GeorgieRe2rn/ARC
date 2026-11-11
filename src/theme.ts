import { Platform } from 'react-native';

export const paper = '#080A0B';
export const sheet = '#101415';
export const ink = '#F2F5F3';
export const muted = '#929B98';
export const rule = '#28312E';
export const hairline = '#202725';
export const up = '#00E5A0';
export const down = '#FF796F';
export const stamp = '#00E5A0';

export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' });
export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'Consolas, "SFMono-Regular", monospace' });
export const display = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' });
