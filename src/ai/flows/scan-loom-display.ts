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
  shift: z.string().optional().describe('The shift. "A" is Day, "B" is Night.'),
  machineNo: z.string().optional().describe('The machine number from the steel plate at the bottom.'),
  stops: z.string().optional().describe('The value from "All stops".'),
  weftMeter: z.string().optional().describe('The value from "Cloth length".'),
  total: z.string().optional().describe('The total time from "Total time". HH:MM:SS'),
  run: z.string().optional().describe('The run time from "Run time len". HH:MM:SS'),
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

You will receive an image of a loom output display. Your task is to extract the following information with high accuracy. Do not miss any fields if they are present in the image.

- Date (DD/MM/YYYY): The date displayed on the loom.
- Time (HH:MM): The time displayed on the loom.
- Shift: 'A' corresponds to 'Day', and 'B' corresponds to 'Night'.
- Machine No.: The machine number is written on the steel plate at the very bottom of the image. It is a physical number on the machine, not on the screen.
- Stops: Get this value from the "All stops" field on the display.
- Weft Meter: Get this value from the "Cloth length" field on the display.
- Total: Get this value from the "Total time" field. Format as HH:MM:SS.
- Run: Get this value from the "Run time len" field. Format as HH:MM:SS.

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
