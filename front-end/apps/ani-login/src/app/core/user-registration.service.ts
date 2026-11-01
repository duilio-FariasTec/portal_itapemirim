import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface UserRegistrationInput {
  nome: string;
  login: string;
  email: string;
  senha: string;
}

@Injectable({ providedIn: 'root' })
export class UserRegistrationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/bff/api/v1';

  register(input: UserRegistrationInput, csrfToken: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/usuarios`, input, {
      withCredentials: true,
      headers: { 'X-CSRF-Token': csrfToken },
    });
  }
}
