import { getStorage } from 'firebase-admin/storage';

export class StorageService {
  private static getBucket() {
    const bucketName = 'audit-widget.firebasestorage.app';
    console.log(`Using storage bucket: ${bucketName}`);
    return getStorage().bucket(bucketName);
  }

  static async uploadScreenshot(
    buffer: Buffer, 
    auditId: string, 
    type: 'desktop' | 'mobile' | 'annotated-desktop' | 'annotated-mobile',
    host: string
  ): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${auditId}-${type}-${timestamp}.png`;
      const storagePath = `screenshots/${host.replace(/[^a-zA-Z0-9]/g, '-')}/${filename}`;
      
      const bucket = this.getBucket();
      const file = bucket.file(storagePath);
      
      console.log(`Uploading screenshot to: gs://${bucket.name}/${storagePath}`);
      
      await file.save(buffer, {
        metadata: {
          contentType: 'image/png',
          metadata: {
            auditId,
            type,
            timestamp
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
