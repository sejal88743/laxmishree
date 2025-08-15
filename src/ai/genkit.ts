'use server';

import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {getFromLocalStorage} from '@/lib/storage';
import {DEFAULT_SETTINGS, type AppSettings} from '@/lib/types';

// For server-side environments, the API key should be set as an environment variable.
// This is more secure and appropriate for production deployments.
const apiKey = process.env.GEMINI_API_KEY;

export const ai = genkit({
  plugins: [googleAI({apiKey})],
  model: 'googleai/gemini-2.0-flash',
});
