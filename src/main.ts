import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent).catch((error: unknown) => {
  // Startup errors are intentionally not echoed with environment data.
  console.error('VirgoStars Mobile failed to start', error instanceof Error ? error.name : 'unknown');
});
