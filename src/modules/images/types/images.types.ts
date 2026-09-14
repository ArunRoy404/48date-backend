export interface ImageUploadResponse {
  url: string;
  key: string;
}

export interface MultiImageUploadResponse {
  url: string;
  key?: string;
  images: ImageUploadResponse[];
}
