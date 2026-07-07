interface ImportResponse {
  businessId: string;
  friendlyId: string;
  previewUrl: string;
}

/**
 * Ask the ManagedSites app to import a URL, build a sales-prospect site and
 * return the /preview/{friendlyId} URL.
 *
 * Configured via MANAGED_SITES_APP_URL and AUDIT_SERVICE_SECRET env vars.
 */
export async function importManagedSitesPreview(
  url: string,
  auditId?: string
): Promise<ImportResponse | null> {
  const appUrl = process.env.MANAGED_SITES_APP_URL;
  const secret = process.env.AUDIT_SERVICE_SECRET;

  if (!appUrl || !secret) {
    console.log('⚠️ ManagedSites import not configured (MANAGED_SITES_APP_URL or AUDIT_SERVICE_SECRET missing). Skipping preview build.');
    return null;
  }

  const endpoint = `${appUrl.replace(/\/$/, '')}/api/admin/sites/import-audit`;
  console.log(`🏗️ Requesting ManagedSites preview build: ${endpoint}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-audit-secret': secret
      },
      body: JSON.stringify({ url, auditId }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ManagedSites import returned ${response.status}: ${text}`);
    }

    const data = await response.json() as ImportResponse;
    console.log(`✅ ManagedSites preview ready: ${data.previewUrl}`);
    return data;
  } catch (error) {
    console.error('❌ ManagedSites preview build failed:', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
