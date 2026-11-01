import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccessRequestReceipt, AccessRequestService, PublicSystemOption } from './core/access-request.service';
import { LoginContext, LoginService } from './core/login.service';

@Component({ imports: [FormsModule], selector: 'ani-login-root', styleUrl: './app.scss', templateUrl: './app.html' })
export class App implements OnInit {
  private readonly authentication = inject(LoginService);
  protected readonly loginContext = signal<LoginContext | null>(null);
  protected readonly contextLoading = signal(true);
  protected readonly loggingIn = signal(false);
  protected readonly loggingOut = signal(false);
  private readonly accessRequests = inject(AccessRequestService);
  protected readonly page = signal<'access' | 'request'>('access');
  protected readonly sending = signal(false);
  protected readonly error = signal('');
  protected readonly systems = signal<PublicSystemOption[]>([]);
  protected readonly systemsLoading = signal(false);
  protected readonly systemsError = signal('');
  protected readonly login = signal('');
  protected readonly password = signal('');
  protected readonly passwordVisible = signal(false);
  protected readonly loginMessage = signal('');
  protected readonly loginTouched = signal(false);
  protected readonly passwordTouched = signal(false);
  protected readonly loginSubmitted = signal(false);
  protected readonly fullName = signal('');
  protected readonly email = signal('');
  protected readonly systemId = signal('');
  protected readonly reason = signal('');
  protected readonly requested = signal(false);
  protected readonly requestId = signal('');
  protected readonly requestSubmitted = signal(false);
  protected readonly nameTouched = signal(false);
  protected readonly emailTouched = signal(false);
  protected readonly systemTouched = signal(false);

  protected showLoginError(): boolean { return (this.loginTouched() || this.loginSubmitted()) && !this.login().trim(); }
  protected showPasswordError(): boolean { return !this.loggingIn() && (this.passwordTouched() || this.loginSubmitted()) && !this.password(); }
  ngOnInit(): void { this.loadLoginContext(); }
  protected loadLoginContext(): void {
    this.contextLoading.set(true);
    this.authentication.context().subscribe({
      next: value => { this.loginContext.set(value); this.contextLoading.set(false); if (!value.configured) this.loginMessage.set('O acesso está temporariamente indisponível. Tente novamente mais tarde.'); },
      error: () => { this.loginContext.set(null); this.contextLoading.set(false); this.loginMessage.set('Não foi possível conectar ao serviço de acesso. Tente novamente.'); },
    });
  }
  protected showNameError(): boolean { return (this.nameTouched() || this.requestSubmitted()) && !this.fullName().trim(); }
  protected showEmailError(): boolean { return (this.emailTouched() || this.requestSubmitted()) && !this.isValidEmail(this.email()); }
  protected showSystemError(): boolean { return (this.systemTouched() || this.requestSubmitted()) && !this.systems().some((system) => system.id === this.systemId()); }
  protected isValidEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()); }
  protected canSubmitRequest(): boolean { return !this.sending() && !this.systemsLoading() && this.systems().length > 0; }

  protected togglePassword(): void { this.passwordVisible.update((visible) => !visible); }

  protected openRequest(): void {
    this.password.set(''); this.passwordVisible.set(false);
    this.page.set('request');
    this.error.set('');
    this.requestSubmitted.set(false);
    if (!this.systems().length && !this.systemsLoading()) this.loadSystems();
  }

  protected loadSystems(): void {
    this.systemsLoading.set(true);
    this.systemsError.set('');
    this.accessRequests.listAvailableSystems().subscribe({
      next: (result) => {
        this.systems.set((result.items ?? []).filter((system) => system.status === 'ativo'));
        this.systemsLoading.set(false);
      },
      error: () => {
        this.systems.set([]);
        this.systemsLoading.set(false);
        this.systemsError.set('Não foi possível carregar os sistemas. Tente novamente mais tarde.');
      },
    });
  }

  protected submitLogin(): void {
    if (this.loggingIn() || this.contextLoading() || !this.loginContext()?.configured) return;
    this.loginMessage.set('');
    this.loginSubmitted.set(true);
    if (!this.login().trim() || this.login().length > 200 || !this.password() || this.password().length > 256) {
      this.loginMessage.set('Revise os campos destacados para continuar.'); return;
    }
    const csrf = this.loginContext()?.csrfToken;
    if (!csrf) { this.loginMessage.set('Atualize o acesso antes de continuar.'); return; }
    this.loggingIn.set(true);
    const password = this.password(); this.password.set(''); this.passwordVisible.set(false);
    this.authentication.login(this.login().trim(), password, csrf).subscribe({
      next: value => {
        this.loggingIn.set(false);
        if (!value.authenticated || !value.user?.id || !value.user?.displayName || !value.csrfToken) { this.loginMessage.set('O serviço não confirmou seu acesso. Tente novamente mais tarde.'); return; }
        this.loginContext.set(value); this.loginSubmitted.set(false); this.loginMessage.set('');
        requestAnimationFrame(() => document.getElementById('card-title')?.focus());
      },
      error: (failure: HttpErrorResponse) => {
        this.loggingIn.set(false); this.loginSubmitted.set(false); this.passwordTouched.set(false);
        this.loginMessage.set(failure.status === 401 ? 'Login ou senha inválidos.' : failure.status === 429 ? 'Muitas tentativas. Aguarde antes de tentar novamente.' : failure.status === 403 ? 'Seu acesso expirou. Atualize e tente novamente.' : 'Não foi possível confirmar seu acesso. Tente novamente mais tarde.');
        if (failure.status === 403) this.loadLoginContext();
      },
    });
  }

  protected logout(): void {
    const csrf = this.loginContext()?.csrfToken;
    if (!csrf || this.loggingOut()) return;
    this.loggingOut.set(true);
    this.authentication.logout(csrf).subscribe({
      next: () => { this.loggingOut.set(false); this.loginContext.set(null); this.login.set(''); this.password.set(''); this.loadLoginContext(); },
      error: (failure: HttpErrorResponse) => { this.loggingOut.set(false); this.loginMessage.set('Não foi possível confirmar a saída. Tente novamente.'); if ([401,403].includes(failure.status)) this.loadLoginContext(); },
    });
  }

  protected submit(): void {
    this.requestSubmitted.set(true);
    this.error.set('');
    const name = this.fullName().trim();
    const email = this.email().trim();
    const system = this.systems().find((item) => item.id === this.systemId());
    const reason = this.reason().trim();
    if (!name || name.length > 120 || !this.isValidEmail(email) || email.length > 180 || !system || reason.length > 500) {
      this.error.set('Confira os campos destacados e os limites de caracteres antes de enviar.'); return;
    }

    this.sending.set(true);
    this.accessRequests.submit({ nome: name, email, sistemaId: system.id, justificativa: reason || undefined }).subscribe({
      next: (receipt: AccessRequestReceipt) => {
        if (!receipt?.id || receipt.status !== 'pending') {
          this.error.set('O BFF respondeu sem confirmar a solicitação. Atualize a fila antes de tentar novamente.');
          this.sending.set(false);
          return;
        }
        this.requestId.set(receipt.id);
        this.requested.set(true);
        this.sending.set(false);
      },
      error: (failure: HttpErrorResponse) => {
        this.error.set(this.requestError(failure));
        this.sending.set(false);
      },
    });
  }

  protected startAnotherRequest(): void {
    this.requested.set(false); this.requestId.set('');
    this.fullName.set(''); this.email.set(''); this.systemId.set(''); this.reason.set('');
    this.nameTouched.set(false); this.emailTouched.set(false); this.systemTouched.set(false); this.requestSubmitted.set(false);
    this.error.set(''); this.page.set('request');
  }

  private requestError(error: HttpErrorResponse): string {
    if (error.status === 0) return 'Não foi possível conectar ao BFF. Seus dados não foram confirmados; tente novamente.';
    if (error.status === 400 || error.status === 422) return typeof error.error?.title === 'string' ? error.error.title : 'Revise os dados informados.';
    if (error.status === 409) return 'Já existe uma solicitação em análise para esses dados. Consulte a equipe responsável.';
    if (error.status === 429) return 'Muitas solicitações em sequência. Aguarde e tente novamente.';
    return 'Não foi possível registrar a solicitação. Tente novamente mais tarde.';
  }
}
