import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const adminAuthGuard: CanActivateChildFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const session = await auth.refresh();
  return session.authenticated || router.createUrlTree(['/login']);
};
