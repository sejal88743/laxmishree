
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {getFromLocalStorage} from '@/lib/storage';
import {DEFAULT_SETTINGS, type AppSettings} from '@/lib/types';

// Dynamically get the API key from localStorage.
// Note: This approach is suitable for client-side or environments where localStorage is available.
// For server-side rendering (SSR) or server environments, you'd typically use environment variables.
let apiKey: string | undefined = undefined;
if (typeof window !== 'undefined') {
  const settings = getFromLocalStorage<AppSettings>('laxmi-shree-settings', DEFAULT_SETTINGS);
  apiKey = settings.geminiApiKey;
}

export const ai = genkit({
  plugins: [googleAI({apiKey})],
  model: 'googleai/gemini-2.0-flash',
});
