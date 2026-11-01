import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface LoginContext {
  configured: boolean;
  authenticated: boolean;
  csrfToken?: string;
  adminUrl?: string;
  user?: { id: string; displayName: string };
}
@Injectable({ providedIn: 'root' })
export class LoginService {
  private readonly http = inject(HttpClient);
  context(): Observable<LoginContext> { return this.http.get<LoginContext>('/bff/auth/context', { withCredentials: true }); }
  login(login: string, senha: string, csrfToken: string): Observable<LoginContext> {
    return this.http.post<LoginContext>('/bff/auth/user-login', {login, senha}, {withCredentials:true,headers:{'X-CSRF-Token':csrfToken}});
  }
  logout(csrfToken: string): Observable<LoginContext> {
    return this.http.post<LoginContext>('/bff/auth/user-logout', {}, {withCredentials:true,headers:{'X-CSRF-Token':csrfToken}});
  }
}
