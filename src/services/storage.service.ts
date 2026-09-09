import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../config/supabase';
import { ENV } from '../config/env';
import { ApiError } from '../utils/apiError';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type ImageUpload = { buffer: Buffer; mimetype: string; originalname: string };

export class StorageService {
  static async uploadUserImage(userId: string, image: ImageUpload) {
    if (image.buffer.length > MAX_IMAGE_SIZE) {
      throw ApiError.badRequest('Image must be 5 MB or smaller');
    }
    if (!ALLOWED_IMAGE_TYPES.has(image.mimetype)) {
      throw ApiError.badRequest('Image must be JPEG, PNG, or WebP');
    }

    const extension = path.extname(image.originalname).toLowerCase() || '.jpg';
    const objectPath = `users/${userId}/${randomUUID()}${extension}`;
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.storage
      .from(ENV.SUPABASE_STORAGE_BUCKET)
      .upload(objectPath, image.buffer, { contentType: image.mimetype, upsert: false });

    if (error) throw ApiError.internal('Failed to upload image', error.message);
    return supabaseAdmin.storage.from(ENV.SUPABASE_STORAGE_BUCKET).getPublicUrl(objectPath).data.publicUrl;
  }
}
