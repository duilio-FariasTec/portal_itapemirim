import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UserRegistrationService } from './core/user-registration.service';
import { LoginContext, LoginService } from './core/login.service';

@Component({ imports: [FormsModule], selector: 'ani-login-root', styleUrl: './app.scss', templateUrl: './app.html' })
export class App implements OnInit {
  private readonly authentication = inject(LoginService);
  protected readonly loginContext = signal<LoginContext | null>(null);
  protected readonly contextLoading = signal(true);
  protected readonly loggingIn = signal(false);
  protected readonly loggingOut = signal(false);
  private readonly registration = inject(UserRegistrationService);
  protected readonly page = signal<'access' | 'register' | 'recovery'>('access');
  protected readonly registering = signal(false);
  protected readonly error = signal('');
  protected readonly login = signal('');
  protected readonly password = signal('');
  protected readonly registrationPassword = signal('');
  protected readonly passwordConfirmation = signal('');
  protected readonly passwordVisible = signal(false);
  protected readonly loginMessage = signal('');
  protected readonly loginTouched = signal(false);
  protected readonly passwordTouched = signal(false);
  protected readonly loginSubmitted = signal(false);
  protected readonly recoveryLogin = signal('');
  protected readonly recoverySubmitted = signal(false);
  protected readonly recoveryLoading = signal(false);
  protected readonly recoveryError = signal('');
  protected readonly recoveryMessage = signal('');
  protected readonly recoveryComplete = signal(false);
  protected readonly fullName = signal('');
  protected readonly email = signal('');
  protected readonly registrationComplete = signal(false);
  protected readonly registrationSubmitted = signal(false);
  protected readonly nameTouched = signal(false);
  protected readonly emailTouched = signal(false);
  protected readonly registrationPasswordTouched = signal(false);
  protected readonly passwordConfirmationTouched = signal(false);

  protected showLoginError(): boolean { return (this.loginTouched() || this.loginSubmitted()) && !this.login().trim(); }
  protected showPasswordError(): boolean { return !this.loggingIn() && (this.passwordTouched() || this.loginSubmitted()) && !this.password(); }
  protected showRecoveryError(): boolean { return !this.recoveryLoading() && this.recoverySubmitted() && (!this.isValidEmail(this.recoveryLogin()) || this.recoveryLogin().trim().length > 180); }
  ngOnInit(): void { this.loadLoginContext(); }
  protected loadLoginContext(): void {
    this.contextLoading.set(true);
    this.authentication.context().subscribe({
      next: value => { this.loginContext.set(value); this.contextLoading.set(false); if (!value.configured) this.loginMessage.set('O acesso está temporariamente indisponível. Tente novamente mais tarde.'); },
      error: () => { this.loginContext.set(null); this.contextLoading.set(false); this.loginMessage.set('Não foi possível conectar ao serviço de acesso. Tente novamente.'); },
    });
  }
  protected showNameError(): boolean { return (this.nameTouched() || this.registrationSubmitted()) && !this.fullName().trim(); }
  protected showEmailError(): boolean { return (this.emailTouched() || this.registrationSubmitted()) && !this.isValidEmail(this.email()); }
  protected showRegistrationPasswordError(): boolean { return (this.registrationPasswordTouched() || this.registrationSubmitted()) && !this.registrationPassword(); }
  protected showPasswordConfirmationError(): boolean { return (this.passwordConfirmationTouched() || this.registrationSubmitted()) && this.passwordConfirmation() !== this.registrationPassword(); }
  protected isValidEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()); }
  protected canSubmitRegistration(): boolean { return !this.registering() && !this.contextLoading() && Boolean(this.loginContext()?.registrationEnabled && this.loginContext()?.csrfToken); }

  protected togglePassword(): void { this.passwordVisible.update((visible) => !visible); }

  protected openRecovery(): void {
    this.password.set('');
    this.passwordVisible.set(false);
    this.recoveryLogin.set(this.isValidEmail(this.login()) ? this.login() : '');
    this.recoverySubmitted.set(false);
    this.recoveryError.set('');
    this.recoveryMessage.set('');
    this.recoveryComplete.set(false);
    this.page.set('recovery');
  }
  protected closeRecovery(): void {
    if (this.recoveryLoading()) return;
    this.recoveryLogin.set('');
    this.recoverySubmitted.set(false);
    this.recoveryError.set('');
    this.recoveryMessage.set('');
    this.recoveryComplete.set(false);
    this.page.set('access');
  }
  protected submitRecovery(): void {
    if (this.recoveryLoading()) return;
    this.recoverySubmitted.set(true);
    this.recoveryError.set('');
    const email = this.recoveryLogin().trim();
    if (!this.isValidEmail(email) || email.length > 180) return;
    const csrf = this.loginContext()?.csrfToken;
    if (!csrf || !this.loginContext()?.configured) {
      this.recoveryError.set('O serviço de recuperação está indisponível. Atualize o acesso e tente novamente.');
      return;
    }

    this.recoveryLoading.set(true);
    this.authentication.requestPasswordReset(email, csrf).subscribe({
      next: result => {
        this.recoveryLoading.set(false);
        if (typeof result?.mensagem !== 'string' || !result.mensagem.trim()) {
          this.recoveryError.set('Não foi possível confirmar a solicitação. Tente novamente mais tarde.');
          return;
        }
        this.recoveryLogin.set('');
        this.recoveryMessage.set(result.mensagem);
        this.recoveryComplete.set(true);
      },
      error: (failure: HttpErrorResponse) => {
        this.recoveryLoading.set(false);
        if (failure.status === 403) {
          this.recoveryError.set('A sessão de segurança expirou. Atualizamos o acesso; tente novamente.');
          this.loadLoginContext();
          return;
        }
        this.recoveryError.set(failure.status === 429
          ? 'Muitas solicitações em sequência. Aguarde e tente novamente.'
          : 'Não foi possível processar a recuperação agora. Tente novamente mais tarde.');
      },
    });
  }

  protected openRegistration(): void {
    this.password.set(''); this.passwordVisible.set(false);
    this.registrationPassword.set(''); this.passwordConfirmation.set('');
    this.page.set('register');
    this.error.set('');
    this.registrationSubmitted.set(false);
  }
  protected closeRegistration(): void {
    if (this.registering()) return;
    this.registrationPassword.set(''); this.passwordConfirmation.set('');
    this.error.set(''); this.page.set('access');
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

  protected submitRegistration(): void {
    if (this.registering()) return;
    this.registrationSubmitted.set(true);
    this.error.set('');
    const name = this.fullName().trim();
    const email = this.email().trim();
    const senha = this.registrationPassword();
    if (!name || name.length > 120 || !this.isValidEmail(email) || email.length > 180 || !senha || senha.length > 256 || senha !== this.passwordConfirmation()) {
      this.error.set('Confira os campos destacados antes de criar a conta.'); return;
    }
    const csrf = this.loginContext()?.csrfToken;
    if (!csrf || !this.loginContext()?.registrationEnabled) {
      this.error.set('O cadastro direto está desabilitado neste ambiente.');
      return;
    }

    this.registering.set(true);
    this.registrationPassword.set(''); this.passwordConfirmation.set('');
    this.registration.register({ nome: name, login: email, email, senha }, csrf).subscribe({
      next: (result) => {
        this.registering.set(false);
        if (!result?.ok) {
          this.error.set('O serviço não confirmou a criação da conta. Tente novamente.');
          return;
        }
        this.registrationComplete.set(true);
      },
      error: (failure: HttpErrorResponse) => {
        this.error.set(this.registrationError(failure));
        this.registering.set(false);
      },
    });
  }

  protected startAnotherRegistration(): void {
    this.registrationComplete.set(false);
    this.fullName.set(''); this.email.set(''); this.registrationPassword.set(''); this.passwordConfirmation.set('');
    this.nameTouched.set(false); this.emailTouched.set(false); this.registrationPasswordTouched.set(false); this.passwordConfirmationTouched.set(false); this.registrationSubmitted.set(false);
    this.error.set(''); this.page.set('register');
  }

  private registrationError(error: HttpErrorResponse): string {
    if (error.status === 0) return 'Não foi possível conectar ao serviço. A conta não foi confirmada; tente novamente.';
    if (error.status === 401) return 'Sua sessão de cadastro expirou. Atualize a página e tente novamente.';
    if (error.status === 403) return 'O cadastro direto está desabilitado neste ambiente ou a proteção de sessão expirou.';
    if (error.status === 400 || error.status === 422) return typeof error.error?.title === 'string' ? error.error.title : 'Revise os dados informados.';
    if (error.status === 409) return 'Já existe uma conta com esses dados. Verifique as informações ou procure a equipe responsável.';
    if (error.status === 429) return 'Muitas solicitações em sequência. Aguarde e tente novamente.';
    return 'Não foi possível criar a conta. Tente novamente mais tarde.';
  }
}
