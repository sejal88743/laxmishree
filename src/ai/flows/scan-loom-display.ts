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
  prompt: `You are an expert in optical character recognition (OCR) and data extraction from images of loom output displays. Your primary task is to extract specific information from the provided image with the highest possible accuracy.

Analyze the image provided and extract the following fields. Be meticulous and ensure every piece of data is captured correctly.

1.  **Date**: Find the date on the display. It should be in DD/MM/YYYY format.
2.  **Time**: Find the time on the display. It should be in HH:MM format.
3.  **Shift**: Identify the shift. Look for a letter, usually 'A' or 'B'. 'A' corresponds to the 'Day' shift, and 'B' corresponds to the 'Night' shift.
4.  **Machine No.**: This is a critical field. The machine number is physically engraved on a steel plate located at the very bottom of the image, separate from the digital screen. Extract only the numeric value from this plate.
5.  **Stops**: Locate the field labeled "All stops" on the digital display and extract its numeric value.
6.  **Weft Meter**: Locate the field labeled "Cloth length" on the digital display. This is the weft meter value. Extract the numeric value.
7.  **Total Time**: Find the "Total time" field on the display and extract its value. Ensure the format is HH:MM:SS.
8.  **Run Time**: Find the "Run time len" field on the display. This is the run time. Extract its value. Ensure the format is HH:MM:SS.

Return the extracted data in a structured JSON format. If any field is not present or unreadable, leave it blank, but do your best to extract all available information.

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
