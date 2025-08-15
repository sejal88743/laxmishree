'use server';

/**
 * @fileOverview AI agent for scanning loom display and auto-populating form fields.
 *
 * - scanLoomDisplay - A function that handles the loom display scanning process.
 * - ScanLoomDisplayInput - The input type for the scanLoomDisplay function.
 * - ScanLoomDisplayOutput - The return type for the scanLoomDisplay function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ScanLoomDisplayInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of the loom's output display, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ScanLoomDisplayInput = z.infer<typeof ScanLoomDisplayInputSchema>;

const ScanLoomDisplayOutputSchema = z.object({
  date: z.string().optional().describe('The date displayed on the loom. DD/MM/YYYY'),
  time: z.string().optional().describe('The time displayed on the loom. HH:MM'),
  shift: z.string().optional().describe('The shift displayed on the loom (Day/Night).'),
  machineNo: z.string().optional().describe('The machine number displayed on the loom.'),
  stops: z.string().optional().describe('The number of stops displayed on the loom.'),
  weftMeter: z.string().optional().describe('The weft meter value displayed on the loom.'),
  total: z.string().optional().describe('The total time displayed on the loom. HH:MM:SS'),
  run: z.string().optional().describe('The run time displayed on the loom. HH:MM:SS'),
});
export type ScanLoomDisplayOutput = z.infer<typeof ScanLoomDisplayOutputSchema>;

export async function scanLoomDisplay(input: ScanLoomDisplayInput): Promise<ScanLoomDisplayOutput> {
  return scanLoomDisplayFlow(input);
}

const prompt = ai.definePrompt({
  name: 'scanLoomDisplayPrompt',
  input: {schema: ScanLoomDisplayInputSchema},
  output: {schema: ScanLoomDisplayOutputSchema},
  prompt: `You are an expert in optical character recognition (OCR) and data extraction from images of loom output displays.

You will receive an image of a loom output display and your task is to extract the following information, if present in the image:
- Date (DD/MM/YYYY)
- Time (HH:MM)
- Shift (Day / Night)
- Machine No.
- Stops
- Weft Meter
- Total (HH:MM:SS)
- Run (HH:MM:SS)

Return the extracted data in JSON format. If a field is not found or unreadable, leave that field blank.

Image: {{media url=photoDataUri}}
`,
});

const scanLoomDisplayFlow = ai.defineFlow(
  {
    name: 'scanLoomDisplayFlow',
    inputSchema: ScanLoomDisplayInputSchema,
    outputSchema: ScanLoomDisplayOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
