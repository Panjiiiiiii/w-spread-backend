import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../config/supabase';
import { ENV } from '../config/env';
import { ApiError } from '../utils/apiError';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type ImageUpload = { buffer: Buffer; mimetype: string; originalname: string };
export type FileUpload = { buffer: Buffer; mimetype: string; originalname: string };

// Statement PDFs are private financial documents: 5 minutes is enough time
// for the client to fetch the signed URL and immediately open/download it,
// without leaving a long-lived link floating around in client memory/logs.
const STATEMENT_SIGNED_URL_TTL_SECONDS = 5 * 60;

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

  /**
   * Uploads the original e-statement PDF to a PRIVATE bucket and returns the
   * object PATH — never a public URL. Callers must persist this path and
   * later use `getStatementFileSignedUrl` to grant temporary access; there
   * is deliberately no `getPublicUrl` counterpart here since bank
   * statements are private financial documents.
   */
  static async uploadStatementFile(userId: string, file: FileUpload): Promise<string> {
    const objectPath = `users/${userId}/${randomUUID()}.pdf`;
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.storage
      .from(ENV.SUPABASE_STATEMENTS_BUCKET)
      .upload(objectPath, file.buffer, { contentType: file.mimetype || 'application/pdf', upsert: false });

    if (error) throw ApiError.internal('Failed to store the uploaded statement file', error.message);
    return objectPath;
  }

  /**
   * Issues a short-lived signed URL for a previously uploaded statement PDF.
   * This is the ONLY supported way to read the file back — the bucket
   * itself must remain private (no public read policy).
   */
  static async getStatementFileSignedUrl(filePath: string): Promise<string> {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.storage
      .from(ENV.SUPABASE_STATEMENTS_BUCKET)
      .createSignedUrl(filePath, STATEMENT_SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      throw ApiError.internal('Failed to generate a signed URL for the statement file', error?.message);
    }
    return data.signedUrl;
  }
}
