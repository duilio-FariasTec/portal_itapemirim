import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { CsrfTokenStore } from './core/auth/csrf-token.store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([(request, next) => {
      const token = inject(CsrfTokenStore).token();
      if (request.url.startsWith('/bff/') && token && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        return next(request.clone({ setHeaders: { 'X-CSRF-Token': token } }));
      }
      return next(request);
    }])),
    provideRouter(routes)
  ]
};
