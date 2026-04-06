import { useState, useCallback } from 'react';
import { useConfigStore } from '@/store/configStore';
import { analyzeImage } from '@/lib/vision';
import type { ImageAttachment } from '@/components/shared/ImageInput';

interface ImageAnalysisResult {
  analysis: string | null;
  error: string | null;
}

interface UseImageAnalysisResult {
  isAnalyzing: boolean;
  analysisError: string | null;
  analyzeImages: (images: ImageAttachment[]) => Promise<ImageAnalysisResult>;
  hasApiKey: boolean;
}

export function useImageAnalysis(): UseImageAnalysisResult {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const config = useConfigStore(state => state.config);
  const hasApiKey = !!config?.google_api_key;

  const analyzeImages = useCallback(async (images: ImageAttachment[]): Promise<ImageAnalysisResult> => {
    console.log('[useImageAnalysis] analyzeImages called with', images.length, 'images')
    
    if (images.length === 0) {
      return { analysis: null, error: null };
    }

    if (!hasApiKey) {
      const errorMsg = 'Gemini API key not configured. Please add it in Settings → Image Analysis.';
      console.error('[useImageAnalysis] No API key')
      setAnalysisError(errorMsg);
      return { analysis: null, error: errorMsg };
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    console.log('[useImageAnalysis] Starting analysis...')

    try {
      const analysisParts: string[] = [];

      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        console.log('[useImageAnalysis] Analyzing image', i + 1, '/', images.length)
        
        const result = await analyzeImage(image.base64);
        console.log('[useImageAnalysis] Image result:', result)

        if (!result.success) {
          throw new Error(result.error || 'Failed to analyze image');
        }

        if (result.description) {
          analysisParts.push(`[Image ${i + 1}]\n${result.description}`);
        }
      }

      const combinedAnalysis = analysisParts.join('\n\n');
      setIsAnalyzing(false);
      console.log('[useImageAnalysis] Analysis complete, length:', combinedAnalysis.length)
      
      return { analysis: combinedAnalysis || null, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error analyzing image';
      console.error('[useImageAnalysis] Error:', errorMessage)
      setAnalysisError(errorMessage);
      setIsAnalyzing(false);
      return { analysis: null, error: errorMessage };
    }
  }, [hasApiKey]);

  return {
    isAnalyzing,
    analysisError,
    analyzeImages,
    hasApiKey,
  };
}

export function buildMessageWithImageAnalysis(
  userMessage: string,
  imageAnalysis: string | null
): string {
  if (!imageAnalysis) {
    return userMessage;
  }

  return `[IMPORTANT: Image has already been analyzed using Gemini. Do NOT use any image analysis tools or MCP. Use the analysis below directly.]

[IMAGE ANALYSIS]
${imageAnalysis}

[USER REQUEST]
${userMessage}`;
}