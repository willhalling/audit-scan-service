import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { AuditResult, PageData } from '../types/index.js';

// Default Firebase config

const DEFAULT_FIREBASE_CONFIG = {
  "type": "service_account",
  "project_id": "audit-scan",
  "private_key_id": "123456abcdef",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDC1LQsXD4N6Ivq\nzrHOZKUTJvG/TshN+UeaVlGuyJDYb8Kcy+5Q+1jjQ7FBRczGTlvmFAPMEzP0+tbw\nxVFP8LMQo3QQT3cTKFbPm+eWEYVUU1sR15YnA29OYlmDpvKhIVPQ/l7D/ykVlMzr\nU0dpcZRoYVO/WTTKJFQaMZTG+fZ6OMlmZIZJ8ioFhqyWQ9hy0qXqk2lipJSuBnkZ\n7YqDt5EErPT10AS7A1Fbm7gJ9EKdCcx87bB+YiWkkIQvXJnKK7UCLS1A0QE7C91R\ntBIZsBnnITKZI2QXbMkUlgxaFvkZuEEoin7z8MNbktW654+A907S+L34ZZH2CDZh\nHEK4ZgSDAgMBAAECggEADvcbWxK317I4R3+w3zcQfKuF7d2NIoIEzR4h2ip9u3Kr\nRVNdMmVT81QX4I59jE4qGwQdLq8bJ1o517XxRvr9wKnMTQnFkqIJNLxRQQ2A10s+\noI2cF0smJPsV7gnboG7J+hO7WjVkVq1WlG6UfTgL0LDcLHY2Z+XBzZ+Y3FLmsSlt\nHd/SOhZ5TvYZVwKGEwvxo9qKjFIoRSuwxM7lYwvk+vOuQMUkR1UsCzu7AP0ZOy6i\nB9CtGR2nkgRnSRKEzZMMgEJ+zph1D6FXMhvIO/RzhWpt6v7LCpHcW7n4ULFwXpvD\nP2Plbb2A7iLUxnGBPjjNrOHj9/dBYWcKQnVXSYbT+QKBgQDj1Xw40/36ChpjCJFT\nzF6zBYjePdZwXB67alOh1m5Ex1fJZQnyWwVUqQUNpD3mOxFx0dXVPY8eLA8wF1aJ\nlfCow4ysbJ71iDkTMNMpI/nQsE/UA9LTaRdJKimKQBu4e5pLWkSJ4yZUiFw2kBWl\nDvd+C1YNKmvDAypk+XRCbbZ/ZQKBgQDaKSp5RUvbFZLEnuHC7oXPqcNCF1kxUF9I\nrd586TH6gIlKbVXyNmM3FeNEDQeic4rLpOS+Fs1zj066Nh5VLxbbs5/eeYGeQPMo\nzJ/TDRxZDxVmMvlFMCIGLBCj6YB+ZMzZ9ss4Ju9SKZ9Xatu3KQbNzeUzA1DHZjjL\nGCY2TYAXRwKBgQCU+LAU8qm9nSN3k/S5ZQ5EhnDFFAgJFJnXe5uJJZmHlcO+d1KJ\nMGTIz+CrZjIJEQpwgAGSVilJH2cDhGwcPlcF4nOr+TGpWADpBPMfmSNbztk0GWaT\nHJPeLYHQJrFwf9XD2XFvy48q9YOOtFxgPJA9K6xx3CQhKRNZg1W9PNB+0QKBgG9X\nPCYNt9LffuHQEuuYxcpwj6zsHDgffZ09EPXyWIGdtpCR3Tas2GHl0iXLmXoYSUol\nuxdXQGEjFwfYXKNTyfAHI5f8CwO92LvvtkMXmKT+1heTL15oAOkRbw3VvpiQ/iXi\nT7GPexWeVCXjB+0Y0fPiJJ+vWXGIyTggjGRENcxZAoGAI5XX3r3+g5l4KJ+nU3OJ\nDpu8vQKZBYvSnlr4nsLF3mgCC7hemrZJJTw5WLFiTrZ5rd6Wpn6+qQOgHWsj5pE7\nvcqcF6NV8uodsXItB7Gx1MLCVUxJ9noQ4+p/0X+GpE3KlhLnFTXUZmQBPx5jqh12\nQEwT7dJiwQp0WBEJnYtQN7g=\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@audit-scan.iam.gserviceaccount.com",
  "client_id": "123456789012345678901",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40audit-scan.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

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
      console.log('- FIREBASE_PRIVATE_KEY exists:', !!process.env.FIREBASE_PRIVATE_KEY);
      
      if (getApps().length === 0) {
        console.log('No Firebase apps initialized yet, creating a new one');
        let serviceAccount;
        // Remove mock fallback: always require credentials
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
          console.log('Using Firebase service account from FIREBASE_SERVICE_ACCOUNT environment variable');
          try {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
          } catch (error) {
            console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', error);
            throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT format');
          }
        } else if (process.env.FIREBASE_PRIVATE_KEY) {
          console.log('Using Firebase credentials from individual environment variables');
          serviceAccount = {
            ...DEFAULT_FIREBASE_CONFIG,
            private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
            private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            client_id: process.env.FIREBASE_CLIENT_ID,
            client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
          };
        } else {
          throw new Error('FIREBASE credentials not provided. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_PRIVATE_KEY and related env vars.');
        }
        console.log('Initializing Firebase with config...');
        this.app = initializeApp({
          credential: cert(serviceAccount),
          projectId: 'audit-scan',
          storageBucket: 'audit-scan.firebasestorage.app'
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
