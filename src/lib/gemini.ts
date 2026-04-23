import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

export function getAi() {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined");
  }
  return new GoogleGenAI({ apiKey });
}

export async function* extractTextFromPdfStream(base64Data: string, mimeType: string = "application/pdf") {
  const ai = getAi();
  
  const stream = await ai.models.generateContentStream({
    model: "gemini-3.1-flash-lite-preview",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text: `Extract all text from this ${mimeType.includes('pdf') ? 'PDF' : 'image'} accurately. Output only the raw text found.`,
        },
      ],
    },
    config: {
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.MINIMAL
      }
    }
  });

  for await (const chunk of stream) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}

export async function processTextAction(
  text: string, 
  action: 'summarize' | 'insights' | 'formalize' | 'translate' | 'custom' | 'table',
  customInput?: string
): Promise<string> {
  const ai = getAi();
  
  const prompts = {
    summarize: "Provide a concise summary of the following text with key take-aways in a structured list.",
    insights: "Extract critical entities, numbers, dates, and organizational insights from this text. Present as a technical report.",
    formalize: "Rewrite the following text to be professional, using executive language suitable for business reports.",
    translate: "Translate the following text to English (if it's not) or provide a clear English interpretation of its meaning.",
    table: "Identify any structured data, lists, or comparison points in the text and convert them into a clean, well-formatted Markdown table. If no clear data exists, create a summary table of keywords and values.",
    custom: customInput || "Analyze the following text based on user requirements."
  };

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: {
      parts: [
        { text: `${prompts[action]}\n\nTEXT:\n${text}` }
      ]
    },
    config: {
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.MINIMAL
      }
    }
  });

  return response.text || "Failed to process text.";
}
