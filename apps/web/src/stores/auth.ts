import Alpine from 'alpinejs';
import {
  supabase, getAuthUser, signInWithEmail,
  signInWithGitHub, signInWithGoogle, signOut,
} from '@kinetic/adapters-web';
import { authRateLimiter } from '@kinetic/adapters-web';
import { resetDeps } from '../deps.js';

export function authStore() {
  return {
    user: null as { id: string; email: string | null; full_name: string | null; avatar_url: string | null } | null,
    loading:       true,
    error:         null as string | null,
    magicLinkSent: false,
    emailInput:    '',
    emailMode:     false,

    async init() {
      this.user    = await getAuthUser();
      this.loading = false;

      if (!supabase) return;

      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          this.user = await getAuthUser();
        } else {
          this.user = null;
          resetDeps();
        }
        this.loading = false;
      });
    },

    async loginWithEmail() {
      this.error = null;
      const email = this.emailInput.trim();

      if (!email || !email.includes('@')) {
        this.error = 'Adresse email invalide';
        return;
      }

      if (!authRateLimiter.canSendMagicLink(email)) {
        const waitSec = Math.ceil(authRateLimiter.getWaitTimeMs(email) / 1000);
        this.error = `Trop de tentatives. Réessaie dans ${waitSec}s.`;
        return;
      }

      try {
        authRateLimiter.recordMagicLink(email);
        await signInWithEmail(email);
        this.magicLinkSent = true;
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Erreur inconnue';
      }
    },

    async loginWithGitHub() {
      this.error = null;
      if (!authRateLimiter.canOAuth()) {
        this.error = 'Trop de tentatives. Attends un moment.';
        return;
      }
      try {
        authRateLimiter.recordOAuth();
        await signInWithGitHub();
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Erreur';
      }
    },

    async loginWithGoogle() {
      this.error = null;
      if (!authRateLimiter.canOAuth()) {
        this.error = 'Trop de tentatives. Attends un moment.';
        return;
      }
      try {
        authRateLimiter.recordOAuth();
        await signInWithGoogle();
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Erreur';
      }
    },

    async logout() {
      await signOut();
      window.location.hash = '/login';
    },

    get isAuthenticated() { return this.user !== null; },
    get initials() {
      if (!this.user?.full_name && !this.user?.email) return '?';
      const name = this.user.full_name ?? this.user.email ?? '';
      return name.split(' ').map((n: string) => n[0] ?? '').join('').toUpperCase().slice(0, 2);
    },
  };
}

Alpine.store('auth', authStore());
