import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiRecord } from '../../../../../../libs/api-contracts/src';

export type MyAccountIdentity = { id: string; displayName: string; profileLabel?: string };
export type MyAccess = { origem: 'api' | 'sessao'; perfis: ApiRecord[]; permissoes: ApiRecord[] };
export type PasswordChange = { senhaAtual: string; novaSenha: string };

/**
 * Port used by the self-service account screen. Each host system supplies an adapter that talks to its own
 * BFF; the browser never calls ANI Core directly and the BFF derives the user from the authenticated session.
 */
export interface MyAccountApi {
  profile(): Observable<ApiRecord>;
  access(): Observable<MyAccess>;
  changePassword(body: PasswordChange): Observable<unknown>;
}

export const MY_ACCOUNT_API = new InjectionToken<MyAccountApi>('MY_ACCOUNT_API');
