import { useConfigStore } from '@/store/configStore';

export interface VisionAnalysisResult {
  success: boolean;
  description?: string;
  error?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

export async function analyzeImage(imageBase64: string): Promise<VisionAnalysisResult> {
  const config = useConfigStore.getState().config;
  const apiKey = config?.google_api_key;

  if (!apiKey) {
    return {
      success: false,
      error: 'Gemini API key not configured. Please add it in Settings → Image Analysis.',
    };
  }

  try {
    const base64Data = imageBase64.includes(',') 
      ? imageBase64.split(',')[1] 
      : imageBase64;

    const mimeType = imageBase64.includes('data:') 
      ? imageBase64.split(';')[0].split(':')[1] 
      : 'image/jpeg';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Analyze this image and provide a detailed description including:
1. Main subjects/objects visible
2. Text content (if any, quote exact text)
3. Colors and visual style
4. Context or setting
5. Any notable details

Be concise but thorough. Format your response clearly.`,
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Failed to analyze image with Gemini';
      
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        if (errorText) {
          errorMessage = errorText;
        }
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }

    const data: GeminiResponse = await response.json();

    if (data.error) {
      return {
        success: false,
        error: data.error.message || 'Unknown Gemini API error',
      };
    }

    if (!data.candidates || data.candidates.length === 0) {
      return {
        success: false,
        error: 'No response generated from Gemini',
      };
    }

    const text = data.candidates[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return {
        success: false,
        error: 'Empty response from Gemini',
      };
    }

    return {
      success: true,
      description: text,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) {
        resolve(reader.result as string);
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function isImageFile(file: File): boolean {
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  return validTypes.includes(file.type);
}