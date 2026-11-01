import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AniPermission, AniResource, ApiRecord, EffectivePermissions, ListQuery, PagedResult, Solicitation,
} from '../../../../../../libs/api-contracts/src';
import { MyAccess } from '../../features/meu-perfil/my-account';

export type MaintainedResource = 'usuarios' | 'sistemas' | 'perfis' | 'permissoes';

/** Typed browser-to-BFF boundary. This client never calls ANI Core directly. */
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1`;

  constructor(private readonly http: HttpClient) {}

  list(resource: AniResource, query: ListQuery = {}): Observable<PagedResult<ApiRecord>> {
    let params = new HttpParams().set('page', query.page ?? 1).set('pageSize', query.pageSize ?? 25);
    for (const [key, value] of Object.entries(query)) {
      if (key !== 'page' && key !== 'pageSize' && value !== undefined && String(value).trim()) params = params.set(key, String(value).trim());
    }
    return this.http.get<PagedResult<ApiRecord>>(`${this.baseUrl}/${resource}`, { params, withCredentials: true });
  }

  get(resource: AniResource, id: string): Observable<ApiRecord> {
    return this.http.get<ApiRecord>(`${this.baseUrl}/${resource}/${encodeURIComponent(id)}`, { withCredentials: true });
  }

  myProfile(): Observable<ApiRecord> {
    return this.http.get<ApiRecord>(`${this.baseUrl}/me`, { withCredentials: true });
  }

  myAccess(): Observable<MyAccess> {
    return this.http.get<MyAccess>(`${this.baseUrl}/me/acessos`, { withCredentials: true });
  }

  changePassword(body: { senhaAtual: string; novaSenha: string }): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/auth/trocar-senha`, body, { withCredentials: true });
  }

  create(resource: MaintainedResource, body: object): Observable<ApiRecord> {
    return this.http.post<ApiRecord>(`${this.baseUrl}/${resource}`, body, { withCredentials: true });
  }

  update(resource: MaintainedResource, id: string, body: object): Observable<ApiRecord> {
    return this.http.put<ApiRecord>(`${this.baseUrl}/${resource}/${encodeURIComponent(id)}`, body, { withCredentials: true });
  }

  deactivate(resource: MaintainedResource, id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${resource}/${encodeURIComponent(id)}`, { withCredentials: true });
  }

  approve(id: string): Observable<Solicitation> {
    return this.http.post<Solicitation>(`${this.baseUrl}/solicitacoes-cadastro/${encodeURIComponent(id)}/aprovar`, {}, { withCredentials: true });
  }

  reject(id: string, justificativa: string): Observable<Solicitation> {
    return this.http.post<Solicitation>(`${this.baseUrl}/solicitacoes-cadastro/${encodeURIComponent(id)}/rejeitar`, { justificativa }, { withCredentials: true });
  }

  userProfiles(userId: string): Observable<{ items: ApiRecord[] }> {
    return this.http.get<{ items: ApiRecord[] }>(`${this.baseUrl}/usuarios/${encodeURIComponent(userId)}/perfis`, { withCredentials: true });
  }

  assignUserProfile(userId: string, profileId: string): Observable<ApiRecord> {
    return this.http.post<ApiRecord>(`${this.baseUrl}/usuarios/${encodeURIComponent(userId)}/perfis`, { perfilId: profileId }, { withCredentials: true });
  }

  revokeUserProfile(userId: string, profileId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/usuarios/${encodeURIComponent(userId)}/perfis/${encodeURIComponent(profileId)}`, { withCredentials: true });
  }

  effectivePermissions(userId: string): Observable<EffectivePermissions> {
    return this.http.get<EffectivePermissions>(`${this.baseUrl}/usuarios/${encodeURIComponent(userId)}/permissoes-efetivas`, { withCredentials: true });
  }

  profilePermissions(profileId: string): Observable<{ items: AniPermission[] }> {
    return this.http.get<{ items: AniPermission[] }>(`${this.baseUrl}/perfis/${encodeURIComponent(profileId)}/permissoes`, { withCredentials: true });
  }

  assignProfilePermission(profileId: string, permissionId: string): Observable<ApiRecord> {
    return this.http.post<ApiRecord>(`${this.baseUrl}/perfis/${encodeURIComponent(profileId)}/permissoes`, { permissaoId: permissionId }, { withCredentials: true });
  }

  revokeProfilePermission(profileId: string, permissionId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/perfis/${encodeURIComponent(profileId)}/permissoes/${encodeURIComponent(permissionId)}`, { withCredentials: true });
  }
}
