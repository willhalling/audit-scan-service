import { getStorage } from 'firebase-admin/storage';
import { getApp } from 'firebase-admin/app';

export class StorageService {
  private static getBucket() {
    // Allow explicit override, otherwise derive from the initialized Firebase app.
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET ||
      `${getApp().options.projectId}.firebasestorage.app`;
    console.log(`Using storage bucket: ${bucketName}`);
    return getStorage().bucket(bucketName);
  }

  /**
   * Upload an audit screenshot (JPEG) to
   * screenshots/{host}/{auditId}-{type}.jpg and return its public URL.
   */
  static async uploadScreenshot(
    buffer: Buffer,
    host: string,
    auditId: string,
    type: 'mobile-fold' | 'desktop-fold' | 'mobile-full' | 'desktop-full'
  ): Promise<string> {
    try {
      const storagePath = `screenshots/${host}/${auditId}-${type}.jpg`;

      const bucket = this.getBucket();
      const file = bucket.file(storagePath);

      console.log(`Uploading screenshot to: gs://${bucket.name}/${storagePath}`);

      await file.save(buffer, {
        metadata: {
          contentType: 'image/jpeg',
          metadata: {
            auditId,
            type
          }
        }
      });

      // Make file publicly accessible
      await file.makePublic();

      // Return public URL
      return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
    } catch (error) {
      console.error('Storage upload error:', error);
      throw error;
    }
  }
}
