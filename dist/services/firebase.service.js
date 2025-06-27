import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
class FirebaseService {
    constructor() {
        if (getApps().length === 0) {
            const serviceAccountPath = path.join(__dirname, '../../audit-scan-firebase-adminsdk-fbsvc-00e968dacc.json');
            initializeApp({
                credential: cert(serviceAccountPath),
                projectId: 'audit-scan',
                storageBucket: 'audit-scan.firebasestorage.app'
            });
        }
        this.db = getFirestore();
        this.db.settings({ ignoreUndefinedProperties: true });
    }
    cleanData(data) {
        if (data === null || data === undefined) {
            return null;
        }
        if (Array.isArray(data)) {
            return data.map(item => this.cleanData(item));
        }
        if (typeof data === 'object') {
            const cleaned = {};
            for (const [key, value] of Object.entries(data)) {
                if (value !== undefined) {
                    cleaned[key] = this.cleanData(value);
                }
            }
            return cleaned;
        }
        return data;
    }
    async createAudit(auditId, url) {
        const host = new URL(url).hostname.replace(/^www\./, '');
        const auditData = {
            auditId,
            host,
            url,
            status: 'pending',
            createdAt: Date.now()
        };
        await this.db.collection('audits').doc(auditId).set(auditData);
    }
    async updateAuditStatus(auditId, status) {
        const updateData = { status };
        if (status === 'completed') {
            updateData.completedAt = Date.now();
        }
        await this.db.collection('audits').doc(auditId).update(updateData);
    }
    async updateAuditPages(auditId, pages) {
        const cleanedPages = this.cleanData(pages);
        await this.db.collection('audits').doc(auditId).update({
            pages: cleanedPages
        });
    }
    async updateAuditError(auditId, error) {
        await this.db.collection('audits').doc(auditId).update({
            status: 'failed',
            error,
            completedAt: Date.now()
        });
    }
    async getAudit(auditId) {
        const doc = await this.db.collection('audits').doc(auditId).get();
        return doc.exists ? doc.data() : null;
    }
}
export const firebaseService = new FirebaseService();
//# sourceMappingURL=firebase.service.js.map