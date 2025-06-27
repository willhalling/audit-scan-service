import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { AuditResult, PageData } from '../types/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FirebaseService {
  private db: Firestore;

  constructor() {
    // Initialize Firebase Admin SDK if not already initialized
    if (getApps().length === 0) {
      const serviceAccountPath = path.join(__dirname, '../../audit-scan-firebase-adminsdk-fbsvc-00e968dacc.json');
      
      initializeApp({
        credential: cert(serviceAccountPath),
        projectId: 'audit-scan',
        storageBucket: 'audit-scan.firebasestorage.app'
      });
    }

    this.db = getFirestore();
    // Configure Firestore to ignore undefined values
    this.db.settings({ ignoreUndefinedProperties: true });
  }

  // Clean data to remove undefined values for Firestore
  private cleanData(data: any): any {
    if (data === null || data === undefined) {
      return null;
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.cleanData(item));
    }
    
    if (typeof data === 'object') {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          cleaned[key] = this.cleanData(value);
        }
      }
      return cleaned;
    }
    
    return data;
  }

  async createAudit(auditId: string, url: string): Promise<void> {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const auditData: AuditResult = {
      auditId,
      host,
      url,
      status: 'pending',
      createdAt: Date.now()
    };

    await this.db.collection('audits').doc(auditId).set(auditData);
  }

  async updateAuditStatus(auditId: string, status: AuditResult['status']): Promise<void> {
    const updateData: any = { status };
    if (status === 'completed') {
      updateData.completedAt = Date.now();
    }
    await this.db.collection('audits').doc(auditId).update(updateData);
  }

  async updateAuditPages(auditId: string, pages: PageData[]): Promise<void> {
    const cleanedPages = this.cleanData(pages);
    await this.db.collection('audits').doc(auditId).update({
      pages: cleanedPages
    });
  }

  async updateAuditError(auditId: string, error: string): Promise<void> {
    await this.db.collection('audits').doc(auditId).update({
      status: 'failed',
      error,
      completedAt: Date.now()
    });
  }

  async getAudit(auditId: string): Promise<AuditResult | null> {
    const doc = await this.db.collection('audits').doc(auditId).get();
    return doc.exists ? doc.data() as AuditResult : null;
  }
}

export const firebaseService = new FirebaseService();
