import type { PreferenceVector, EmotionResult } from "@/types";

export function createInitialPreferenceVector(): PreferenceVector {
  return {
    vector: [],
    topEmotionTags: [],
    topContextKeywords: [],
    preferredTimeSlots: [],
    preferredPlaceTypes: [],
    emotionFrequency: {},
    totalRecords: 0,
  };
}

export function updatePreferenceVector(
  current: PreferenceVector,
  emotionResult: EmotionResult
): PreferenceVector {
  const newFrequency = { ...current.emotionFrequency };
  for (const tag of emotionResult.emotionTags) {
    newFrequency[tag] = (newFrequency[tag] ?? 0) + 1;
  }

  const allEmotionTags = [...new Set([...current.topEmotionTags, ...emotionResult.emotionTags])];
  const allContextKeywords = [...new Set([...current.topContextKeywords, ...emotionResult.contextKeywords])];

  // Sort emotion tags by frequency
  const sortedEmotionTags = allEmotionTags.sort(
    (a, b) => (newFrequency[b] ?? 0) - (newFrequency[a] ?? 0)
  );

  return {
    vector: current.vector,
    topEmotionTags: sortedEmotionTags.slice(0, 10),
    topContextKeywords: allContextKeywords.slice(0, 10),
    preferredTimeSlots: current.preferredTimeSlots,
    preferredPlaceTypes: current.preferredPlaceTypes,
    emotionFrequency: newFrequency,
    totalRecords: current.totalRecords + 1,
  };
}
