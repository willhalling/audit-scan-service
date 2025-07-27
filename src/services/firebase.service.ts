import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { AuditResult, PageData } from '../types/index.js';

// Default Firebase config

const DEFAULT_FIREBASE_CONFIG = {
  "type": "service_account",
  "project_id": "audit-widget",
  "private_key_id": "d37ea464823b557f8aa6499a93e89f1aa0770b17",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDAIskTDy0FqwBn\nuGUf5qFbInX5OwHyjnK+zcNRfGaiuLZ3vazleE0jr68N8Vz5lfkYmusEsyeDTPN8\n8R2qFDVzDlWlwtntDhmvEGoC+kveVdLjvWLuW0NuZjJ1nZPWCSIm374QbPRzrE2U\nUJADA1xBLUg7E+iKoOo2Qjiy4WLaEW3zVVcVcTycIOj14Q0ACm9kuXLpkkr4s3Ia\nvRRs28qdEML3qHuGs0JMzT28wwTbSWbp0Y/lLUFxFUmTKhHDvBm/10lWhBm8BBLf\n8SIsaxMj/rPZwk1mshX3jdkteThCKDgZ90SkuYTWmzs31w/n8QUUgv0A+FUZjWqQ\nueEr85ulAgMBAAECggEACcV7HmoGKySgN6YsFmw/RohBIbS7i59s/IEwbsN54Mqu\nFPbjhSQSID9+EqJ0zQiwi2zNiQanesj+FRuaG509fqV6+5wmQyUVb07RZWdfVmZc\n/FIUZvTjQAkYhdzGuPrr7rgwTVuNLxjTNTjHqi+QkIwCAWcoy2wVnT7O7WIDCf4E\nX3o/Y4m1grMArRW2i3GB1MIK5gtgFww24F5rW2EXLdev+MQOcIdF4+FaooHADB0o\n/cXyosfVGPGZK1iCyWoItfIyTk88g27KWP+Uodezvhiw0MueRVd2+c8u2POC+YF2\n/OHaSnQenOXNi60bEsA140cCoNTGdNOwssSlu72LYQKBgQDeoIb86uX/LM/nwrlh\n3z2IJIlvWMXkaG3znzw1YQpmfpzHbC7knGsm/v3gaJ8bNHarphPkQk67mj1Qi21g\n/oZW32RSrvu3pbL7bHbYO1ClUSdwbUR53cbxukj7S9ukl1m9CrCahShTNB94nddw\nja9/kgDnpa4ZJpPf5AXchjoyPQKBgQDc8CMofPN22wnGb2tJpax4Kp1CxYtVjntD\n6QIo37IqDre9wbLy9nB5sFXkXgTW/3F8IkHm4DPdkh/HflpKKTo03GKpMYO2I+Nt\nVpp/57T/d2gNd6wPN60iJPxPUOHdUw72FDQ3qAXcEdKYeWHNS2kHRv1xnWPxUpbN\nsUj8jYItiQKBgFxPJ2mbZH5n8FTissdYL0VSEQJwRq2sd1q6vdZMRGm3Of6eZts3\n2F41AMOZ3c8D8+i8VichL1AuZhoNle7P2pgOzKRUFd9R/2Ks2KJUBd5mRfoh9HCr\neqAkY7p++7XFY9o0ooGPkObfB+WVXQ04UnqM6X8jfYrEKjB9dci4h0zpAoGAVJ0X\nKetopo1OmhOTyDnN6puPbMIREawmoyR6skKxjg/i6KZlLU2aV9BjpLkpK1nbEYph\nKNWWp3XN++31EE/nvdTlaBzRb5EhCX/QXcnUdL47OGUrnQxanygBBTNZvRSRN0cX\nlHUiAV1GBST/gsstpx7V84wueX6CyLXr2OUtBNkCgYEAxCLmNfB1TJYJEjLyvO2N\ndBKVeTdtWHvDbzbe0YjPH528qKIeQVZh08jienwVGXe0wPw8thl/90Q/xjlWYiUp\nKKicH85oJ60KJIYq0HaRfDAU/Ko/2m18B7Ey5hK8dA7Gy+dHJFzPfrPpvaFVpqPY\ndOz8KLHhMYXHhpjjd0wTNIU=\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@audit-widget.iam.gserviceaccount.com",
  "client_id": "101835604209885374656",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40audit-widget.iam.gserviceaccount.com",
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
          projectId: 'audit-widget',
          storageBucket: 'audit-widget.firebasestorage.app'
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
