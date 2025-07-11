import type { AuditRequest } from './src/types/index.js';

const testRequest: AuditRequest = {
  url: 'https://example.com',
  auditId: 'test-123',
  pages: ['/about'],
  authorUid: 'user-123',
  enableAI: true
};

console.log('auditId:', testRequest.auditId);
