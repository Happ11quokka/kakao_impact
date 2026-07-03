import type { VisionResult } from "@/types";

export interface VisionApiClient {
  analyzeImage(imageUrl: string): Promise<{
    tags: string[];
    confidence: number;
    raw: Record<string, unknown>;
  }>;
}

export class VisionAnalysisService {
  constructor(private client: VisionApiClient) {}

  async analyze(imageUrl: string): Promise<VisionResult> {
    const response = await this.client.analyzeImage(imageUrl);

    return {
      visionTags: response.tags,
      confidence: response.confidence,
      rawResponse: response.raw,
    };
  }
}
