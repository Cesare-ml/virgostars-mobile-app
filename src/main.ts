import { CSP_NONCE } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';

// Tauri adds a per-response CSP nonce to the inline startup style. Angular must
// reuse it for component styles injected into the same document.
const nonce = document.querySelector<HTMLStyleElement>('style[nonce]')?.nonce ?? null;
bootstrapApplication(AppComponent, { providers: [{ provide: CSP_NONCE, useValue: nonce }] }).catch((error: unknown) => {
  // Startup errors are intentionally not echoed with environment data.
  console.error('VirgoStars Mobile failed to start', error instanceof Error ? error.name : 'unknown');
});
