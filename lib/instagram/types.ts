export interface IgListResponse<T> {
  data: T[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string; previous?: string };
}

export interface IgAccountProfile {
  id: string;
  username: string;
  name?: string;
  biography?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}

export interface IgInsightValue {
  value: number;
  end_time?: string;
}

export interface IgInsightItem {
  name: string;
  period: string;
  values: IgInsightValue[];
  title?: string;
  description?: string;
  id?: string;
}

export interface IgMedia {
  id: string;
  media_type?: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "REELS" | "STORY";
  media_product_type?: "FEED" | "REELS" | "STORY" | "AD";
  caption?: string;
  permalink?: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

export type IgMediaInsightMetric =
  | "reach"
  | "impressions"
  | "engagement"
  | "saved"
  | "shares"
  | "comments"
  | "likes"
  | "video_views"
  | "plays"
  | "total_interactions";
