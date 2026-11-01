import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface PublicSystemOption {
  id: string;
  nome: string;
  codigo: string;
  status: string;
}

export interface AccessRequestInput {
  nome: string;
  email: string;
  sistemaId: string;
  justificativa?: string;
}

export interface AccessRequestReceipt {
  id: string;
  status: 'pending';
  sistemaNome: string;
  criadoEm: string;
}

interface Page<T> {
  items: T[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class AccessRequestService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/bff/api/v1';

  listAvailableSystems(): Observable<Page<PublicSystemOption>> {
    const params = new HttpParams().set('page', 1).set('pageSize', 100).set('status', 'ativo');
    return this.http.get<Page<PublicSystemOption>>(`${this.baseUrl}/portais`, { params, withCredentials: true });
  }

  submit(input: AccessRequestInput): Observable<AccessRequestReceipt> {
    return this.http.post<AccessRequestReceipt>(`${this.baseUrl}/solicitacoes-cadastro`, input, { withCredentials: true });
  }
}
