import type {
  SohwakhaengRecord,
  RecordPin,
  MapBounds,
} from "@/types";

export class RecordStorageService {
  private records: Map<string, SohwakhaengRecord> = new Map();

  async save(record: SohwakhaengRecord): Promise<string> {
    this.records.set(record.id, { ...record });
    return record.id;
  }

  async getById(recordId: string): Promise<SohwakhaengRecord> {
    const record = this.records.get(recordId);
    if (!record) {
      throw new Error(`기록을 찾을 수 없습니다: ${recordId}`);
    }
    return { ...record };
  }

  async getByUser(userId: string): Promise<SohwakhaengRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getRecentByUser(userId: string, limit: number): Promise<SohwakhaengRecord[]> {
    const records = await this.getByUser(userId);
    return records.slice(0, limit);
  }

  async getRecordPins(userId: string, bounds: MapBounds): Promise<RecordPin[]> {
    return [...this.records.values()]
      .filter((r) => {
        if (r.userId !== userId) return false;
        if (r.latitude === null || r.longitude === null) return false;
        return (
          r.latitude >= bounds.southWest.latitude &&
          r.latitude <= bounds.northEast.latitude &&
          r.longitude >= bounds.southWest.longitude &&
          r.longitude <= bounds.northEast.longitude
        );
      })
      .map((r) => ({
        id: r.id,
        latitude: r.latitude!,
        longitude: r.longitude!,
        thumbnailUrl: r.imageUrl,
        emotionKeyword: r.emotionTags[0] ?? "기록됨",
        shortText: r.rawUserText?.slice(0, 50) ?? r.aiComment?.slice(0, 50) ?? "소확행 기록",
      }));
  }
}
