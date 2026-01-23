/**
 * DiffViewerHelper
 * Integrates with VS Code's diff viewer to show file changes
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

export class DiffViewerHelper {
  private tempFiles: vscode.Uri[] = [];
  private disposed = false;

  /**
   * Open diff view for a file
   * Compares current file with last committed version (HEAD)
   */
  async openDiff(filePath: string): Promise<void> {
    if (this.disposed) {
      throw new Error('DiffViewerHelper has been disposed');
    }

    try {
      const currentUri = vscode.Uri.file(filePath);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        vscode.window.showErrorMessage(`File not found: ${filePath}`);
        return;
      }

      // Try to get previous version from git
      const previousContent = await this.getPreviousVersion(filePath);

      if (previousContent !== null) {
        // Create temp file for previous version
        const fileName = path.basename(filePath);
        const previousUri = await this.createTempFile(
          previousContent,
          fileName
        );

        // Open diff view
        await vscode.commands.executeCommand(
          'vscode.diff',
          previousUri,
          currentUri,
          `${fileName} (HEAD ↔ Working)`,
          { preview: false }
        );
      } else {
        // No previous version available, just open the file
        // This happens for new files not yet committed
        const document = await vscode.workspace.openTextDocument(currentUri);
        await vscode.window.showTextDocument(document, {
          preview: false,
          preserveFocus: false
        });

        vscode.window.showInformationMessage(
          'This is a new file (no previous version in git). Showing current content.'
        );
      }
    } catch (error) {
      console.error('[DiffViewerHelper] Error opening diff:', error);
      throw error;
    }
  }

  /**
   * Get previous version of file from git HEAD
   * Returns null if git is not available or file is not tracked
   */
  private async getPreviousVersion(filePath: string): Promise<string | null> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return null;
      }

      const cwd = workspaceFolder.uri.fsPath;
      const relativePath = path.relative(cwd, filePath);

      // Check if we're in a git repository
      try {
        execSync('git rev-parse --git-dir', { cwd, encoding: 'utf8', stdio: 'pipe' });
      } catch {
        // Not a git repository
        return null;
      }

      // Check if file is tracked in git
      try {
        execSync(`git ls-files --error-unmatch "${relativePath}"`, {
          cwd,
          encoding: 'utf8',
          stdio: 'pipe'
        });
      } catch {
        // File not tracked in git
        return null;
      }

      // Get file content from HEAD
      const content = execSync(`git show HEAD:"${relativePath}"`, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024 // 10MB max
      });

      return content;
    } catch (error) {
      // Log but don't throw - this is expected for new files
      console.log('[DiffViewerHelper] Could not get previous version:', error);
      return null;
    }
  }

  /**
   * Create temporary file for comparison
   */
  private async createTempFile(content: string, fileName: string): Promise<vscode.Uri> {
    const os = require('os');
    const tempDir = os.tmpdir();
    const uniqueId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const tempFileName = `codepause-${uniqueId}-${fileName}`;
    const tempFilePath = path.join(tempDir, tempFileName);

    fs.writeFileSync(tempFilePath, content, 'utf8');

    const uri = vscode.Uri.file(tempFilePath);
    this.tempFiles.push(uri);

    return uri;
  }

  /**
   * Cleanup temporary files
   */
  private cleanupTempFiles(): void {
    for (const uri of this.tempFiles) {
      try {
        if (fs.existsSync(uri.fsPath)) {
          fs.unlinkSync(uri.fsPath);
        }
      } catch (error) {
        console.warn('[DiffViewerHelper] Failed to cleanup temp file:', uri.fsPath);
      }
    }
    this.tempFiles = [];
  }

  /**
   * Dispose and cleanup all resources
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.cleanupTempFiles();
  }
}
