import { Injectable, signal } from '@angular/core';

/** Keeps the synchronizer token in tab memory; it is not an authentication token. */
@Injectable({ providedIn: 'root' })
export class CsrfTokenStore {
  private readonly value = signal<string | null>(null);
  readonly token = this.value.asReadonly();

  set(token?: string): void { this.value.set(token || null); }
  clear(): void { this.value.set(null); }
}
