/**
 * Alternative screenshot methods when Puppeteer/Chrome fails
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

export class AlternativeScreenshot {
  /**
   * Use wkhtmltopdf/wkhtmltoimage as fallback
   */
  static async wkhtmlScreenshot(url: string, width = 1280, height = 800): Promise<Buffer | null> {
    const tempFile = join(tmpdir(), `screenshot-${Date.now()}.jpg`);
    
    try {
      console.log(`📸 Attempting wkhtmltoimage screenshot for: ${url}`);
      
      const command = `wkhtmltoimage --format jpg --quality 80 --width ${width} --height ${height} --disable-javascript --no-images "${url}" "${tempFile}"`;
      
      await execAsync(command, { timeout: 30000 });
      
      if (require('fs').existsSync(tempFile)) {
        const buffer = readFileSync(tempFile);
        unlinkSync(tempFile);
        return buffer;
      }
      
      return null;
    } catch (error) {
      console.log(`❌ wkhtmltoimage failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      try {
        unlinkSync(tempFile);
      } catch {}
      return null;
    }
  }

  /**
   * Use headless Firefox as fallback
   */
  static async firefoxScreenshot(url: string, width = 1280, height = 800): Promise<Buffer | null> {
    const tempFile = join(tmpdir(), `firefox-screenshot-${Date.now()}.png`);
    
    try {
      console.log(`🦊 Attempting Firefox screenshot for: ${url}`);
      
      // Create a simple HTML file that loads the URL in an iframe
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { margin: 0; padding: 0; }
            iframe { width: ${width}px; height: ${height}px; border: none; }
          </style>
        </head>
        <body>
          <iframe src="${url}"></iframe>
        </body>
        </html>
      `;
      
      const htmlFile = join(tmpdir(), `temp-${Date.now()}.html`);
      writeFileSync(htmlFile, htmlContent);
      
      const command = `firefox --headless --window-size=${width},${height} --screenshot="${tempFile}" "file://${htmlFile}"`;
      
      await execAsync(command, { timeout: 30000 });
      
      if (require('fs').existsSync(tempFile)) {
        const buffer = readFileSync(tempFile);
        unlinkSync(tempFile);
        unlinkSync(htmlFile);
        return buffer;
      }
      
      unlinkSync(htmlFile);
      return null;
    } catch (error) {
      console.log(`❌ Firefox screenshot failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      try {
        unlinkSync(tempFile);
      } catch {}
      return null;
    }
  }

  /**
   * Generate a simple fallback image with URL text
   */
  static async generateFallbackImage(url: string, width = 1280, height = 800): Promise<Buffer> {
    try {
      // Use canvas to generate a simple fallback image
      const { createCanvas } = require('canvas');
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      
      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      
      // Gray border
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, width, height);
      
      // Error message
      ctx.fillStyle = '#333333';
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Screenshot temporarily unavailable', width / 2, height / 2 - 40);
      
      ctx.font = '16px Arial';
      ctx.fillStyle = '#666666';
      ctx.fillText(url, width / 2, height / 2 + 20);
      
      return canvas.toBuffer('image/jpeg', { quality: 0.8 });
    } catch (error) {
      console.log(`❌ Fallback image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Ultimate fallback: return a minimal buffer
      return Buffer.from('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/APlA');
    }
  }

  /**
   * Try all fallback methods in sequence
   */
  static async attemptAllFallbacks(url: string, width = 1280, height = 800): Promise<Buffer> {
    console.log(`🔄 Attempting fallback screenshot methods for: ${url}`);
    
    // Try wkhtmltoimage
    let result = await this.wkhtmlScreenshot(url, width, height);
    if (result) {
      console.log('✅ wkhtmltoimage fallback succeeded');
      return result;
    }
    
    // Try Firefox
    result = await this.firefoxScreenshot(url, width, height);
    if (result) {
      console.log('✅ Firefox fallback succeeded');
      return result;
    }
    
    // Generate fallback image
    console.log('🎨 Generating fallback placeholder image');
    return await this.generateFallbackImage(url, width, height);
  }
}
