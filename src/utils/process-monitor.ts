/**
 * Browser process monitoring and cleanup utilities
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ProcessMonitor {
  private static readonly MAX_CHROME_PROCESSES = 5;
  private static readonly CHROME_MEMORY_LIMIT_MB = 1024;

  /**
   * Check and kill zombie Chrome processes
   */
  static async cleanupZombieProcesses(): Promise<void> {
    try {
      console.log('🧹 Checking for zombie Chrome processes...');
      
      // Get all Chrome processes
      const { stdout } = await execAsync('ps aux | grep -E "(chrome|chromium)" | grep -v grep || true');
      
      if (stdout.trim()) {
        const processes = stdout.trim().split('\n');
        console.log(`Found ${processes.length} Chrome processes`);
        
        // If too many processes, kill them all
        if (processes.length > this.MAX_CHROME_PROCESSES) {
          console.log(`⚠️ Too many Chrome processes (${processes.length}), cleaning up...`);
          await execAsync('pkill -f "chrome|chromium" || true');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      console.log('⚠️ Process cleanup encountered an issue (this is usually fine)');
    }
  }

  /**
   * Monitor Chrome memory usage
   */
  static async checkMemoryUsage(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('ps -eo pid,comm,rss | grep -E "(chrome|chromium)" | grep -v grep || true');
      
      if (stdout.trim()) {
        const processes = stdout.trim().split('\n');
        let totalMemory = 0;
        
        for (const process of processes) {
          const parts = process.trim().split(/\s+/);
          const memoryKB = parseInt(parts[2]) || 0;
          totalMemory += memoryKB;
        }
        
        const totalMemoryMB = totalMemory / 1024;
        console.log(`🧠 Chrome memory usage: ${totalMemoryMB.toFixed(1)}MB`);
        
        if (totalMemoryMB > this.CHROME_MEMORY_LIMIT_MB) {
          console.log(`⚠️ Chrome memory usage too high (${totalMemoryMB}MB), cleanup recommended`);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.log('⚠️ Memory check failed, proceeding anyway');
      return true;
    }
  }

  /**
   * Force kill all Chrome processes
   */
  static async forceKillChrome(): Promise<void> {
    try {
      console.log('💀 Force killing all Chrome processes...');
      await execAsync('pkill -9 -f "chrome|chromium" || true');
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('💀 Force kill complete');
    } catch (error) {
      console.log('⚠️ Force kill encountered issues (this is usually fine)');
    }
  }

  /**
   * Pre-flight check before launching Chrome
   */
  static async preFlightCheck(): Promise<boolean> {
    console.log('🛫 Running pre-flight checks...');
    
    // Check memory
    const memoryOk = await this.checkMemoryUsage();
    if (!memoryOk) {
      await this.cleanupZombieProcesses();
    }
    
    // Check disk space
    try {
      const { stdout } = await execAsync('df /tmp | tail -1 | awk \'{print $5}\' | sed \'s/%//\'');
      const diskUsage = parseInt(stdout.trim());
      
      if (diskUsage > 90) {
        console.log(`⚠️ Disk usage high: ${diskUsage}%`);
        return false;
      }
    } catch (error) {
      console.log('⚠️ Disk check failed, proceeding anyway');
    }
    
    console.log('✅ Pre-flight checks passed');
    return true;
  }
}
