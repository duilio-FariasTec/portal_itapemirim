import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminSession } from '../../../../../../libs/api-contracts/src';
import { CsrfTokenStore } from './csrf-token.store';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly session = signal<AdminSession>({
    authenticated: false,
    authMode: 'unconfigured',
    capabilities: [],
  });
  readonly loading = signal(false);

  constructor(private readonly http: HttpClient, private readonly csrfToken: CsrfTokenStore) {}

  async refresh(): Promise<AdminSession> {
    this.loading.set(true);
    try {
      const session = await firstValueFrom(
        this.http.get<AdminSession>(`${environment.apiBaseUrl}/session`, {
          withCredentials: true,
        }),
      );
      this.session.set(session);
      this.csrfToken.set(session.csrfToken);
    } catch {
      this.session.set({
        authenticated: false,
        authMode: 'unconfigured',
        capabilities: [],
      });
      this.csrfToken.clear();
    } finally {
      this.loading.set(false);
    }
    return this.session();
  }

  async signInLocal(actor: 'admin' | 'consulta'): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<AdminSession>(
        `${environment.apiBaseUrl}/dev/auth/login`,
        { actor },
        { withCredentials: true },
      ),
    );
    this.session.set(response);
    this.csrfToken.set(response.csrfToken);
  }

  async signOut(): Promise<void> {
    await firstValueFrom(
      this.http.post(
        `${environment.apiBaseUrl}/auth/logout`,
        {},
        { withCredentials: true },
      ),
    );
    this.csrfToken.clear();
    this.session.set({
      authenticated: false,
      authMode: 'unconfigured',
      capabilities: [],
    });
  }

  can(capability: string): boolean {
    return this.session().capabilities.includes(capability);
  }
}
