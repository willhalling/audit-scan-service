import { getStorage } from 'firebase-admin/storage';
export class StorageService {
    static getBucket() {
        return getStorage().bucket();
    }
    static async uploadScreenshot(buffer, auditId, type, host) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${auditId}-${type}-${timestamp}.png`;
        const storagePath = `screenshots/${host.replace(/[^a-zA-Z0-9]/g, '-')}/${filename}`;
        const bucket = this.getBucket();
        const file = bucket.file(storagePath);
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
        await file.makePublic();
        return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
    }
}
//# sourceMappingURL=storage.service.js.map