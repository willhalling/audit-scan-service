import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { AuditResult, PageData } from '../types/index.js';

// Minimal service-account fields required by firebase-admin.
// We reconstruct the certificate from env vars so you don't have to paste the
// whole JSON into RunPod (matches the wavecanvas-lyrics-worker pattern).
function buildServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('Using Firebase service account from FIREBASE_SERVICE_ACCOUNT env var');
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (error) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', error);
      throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT format');
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    console.log('Using Firebase credentials from individual env vars');
    return {
      type: 'service_account',
      project_id: projectId,
      private_key: privateKey.replace(/\\n/g, '\n'),
      client_email: clientEmail,
      // Optional extras (not required for Firestore auth).
      ...(process.env.FIREBASE_PRIVATE_KEY_ID ? { private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID } : {}),
      ...(process.env.FIREBASE_CLIENT_ID ? { client_id: process.env.FIREBASE_CLIENT_ID } : {}),
      ...(process.env.FIREBASE_CLIENT_CERT_URL ? { client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL } : {})
    };
  }

  throw new Error(
    'Firebase credentials not provided. Set either FIREBASE_SERVICE_ACCOUNT (full JSON) ' +
    'or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.'
  );
}

// Mock Firebase service when no credentials are available
class MockFirebaseService {
  async saveAuditResult(auditId: string, data: AuditResult): Promise<void> {
    console.log(`[MOCK] Saving audit result: ${auditId}`);
  }

  async updateAuditProgress(auditId: string, status: string, current: number, total: number): Promise<void> {
    console.log(`[MOCK] Updating audit progress: ${auditId} - ${status} - ${current}/${total}`);
  }

  async savePageData(auditId: string, url: string, data: PageData): Promise<void> {
    console.log(`[MOCK] Saving page data for audit: ${auditId}, URL: ${url}`);
  }
}

class FirebaseService {
  private db: Firestore;
  private app: App;

  constructor() {
    try {
      console.log('Initializing Firebase service...');
      console.log('Environment check:');
      console.log('- NODE_ENV:', process.env.NODE_ENV);
      console.log('- FIREBASE_SERVICE_ACCOUNT exists:', !!process.env.FIREBASE_SERVICE_ACCOUNT);
      console.log('- FIREBASE_PROJECT_ID exists:', !!process.env.FIREBASE_PROJECT_ID);
      console.log('- FIREBASE_CLIENT_EMAIL exists:', !!process.env.FIREBASE_CLIENT_EMAIL);
      console.log('- FIREBASE_PRIVATE_KEY exists:', !!process.env.FIREBASE_PRIVATE_KEY);
      
      if (getApps().length === 0) {
        console.log('No Firebase apps initialized yet, creating a new one');
        const serviceAccount = buildServiceAccount();
        const projectId = serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID;
        if (!projectId) {
          throw new Error('Could not determine Firebase projectId');
        }
        console.log('Initializing Firebase with projectId:', projectId);
        this.app = initializeApp({
          credential: cert(serviceAccount),
          projectId,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`
        });
      } else {
        console.log('Using existing Firebase app');
        this.app = getApps()[0];
      }
      this.db = getFirestore();
      this.db.settings({ ignoreUndefinedProperties: true });
      console.log('Firebase initialization complete');
    } catch (error) {
      console.error('Failed to initialize Firebase properly:', error);
      throw error;
    }
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

  async createAudit(auditId: string, url: string, authorUid?: string): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized');
    const host = new URL(url).hostname.replace(/^www\./, '');
    const auditData: AuditResult = {
      auditId,
      host,
      url,
      status: 'pending',
      createdAt: Date.now(),
      ...(authorUid ? { authorUid } : {})
    };

    await this.db.collection('audits').doc(auditId).set(auditData);
  }

  async updateAuditStatus(auditId: string, status: AuditResult['status']): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized');
    const updateData: any = { status };
    if (status === 'completed') {
      updateData.completedAt = Date.now();
    }
    await this.db.collection('audits').doc(auditId).update(updateData);
  }

  async updateAuditPages(auditId: string, pages: PageData[]): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized');
    const cleanedPages = this.cleanData(pages);
    await this.db.collection('audits').doc(auditId).update({
      pages: cleanedPages
    });
  }

  async updateAuditError(auditId: string, error: string): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized');
    await this.db.collection('audits').doc(auditId).update({
      status: 'failed',
      error,
      completedAt: Date.now()
    });
  }

  async getAudit(auditId: string): Promise<AuditResult | null> {
    if (!this.db) throw new Error('Firestore is not initialized');
    const doc = await this.db.collection('audits').doc(auditId).get();
    return doc.exists ? doc.data() as AuditResult : null;
  }
}

// Export a factory function instead of instantiating immediately
let firebaseServiceInstance: FirebaseService | null = null;

export const getFirebaseService = (): FirebaseService => {
  if (!firebaseServiceInstance) {
    firebaseServiceInstance = new FirebaseService();
  }
  return firebaseServiceInstance;
};

// Lazy-loaded service that only initializes when first accessed
export const firebaseService = {
  get instance() {
    return getFirebaseService();
  },
  
  async createAudit(auditId: string, url: string, authorUid?: string) {
    return this.instance.createAudit(auditId, url, authorUid);
  },
  
  async updateAuditStatus(auditId: string, status: any) {
    return this.instance.updateAuditStatus(auditId, status);
  },
  
  async updateAuditPages(auditId: string, pages: any[]) {
    return this.instance.updateAuditPages(auditId, pages);
  },
  
  async updateAuditError(auditId: string, error: string) {
    return this.instance.updateAuditError(auditId, error);
  },
  
  async getAudit(auditId: string) {
    return this.instance.getAudit(auditId);
  }
};
