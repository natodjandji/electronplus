import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { apiFetch } from "./api-client";

/**
 * Popups get blocked by a lot of real-world setups (strict blockers, iOS
 * Safari, embedded webviews, automation sandboxes) — fall back to a
 * full-page redirect instead of just failing. Deliberately excludes
 * "popup-closed-by-user": that's a real user backing out, not a technical
 * failure, and shouldn't be followed by an unexpected full navigation.
 *
 * "internal-error" and "web-storage-unsupported" are included too: our
 * authDomain (electronplus-ve.firebaseapp.com, required by the Google OAuth
 * client — see firebase.ts) is a different origin from the app itself, so
 * signInWithPopup depends on third-party storage/cookies to hand the result
 * back across that origin boundary. Chrome/Safari/Brave increasingly block
 * that by default, which is the most likely cause of intermittent
 * "no se pudo completar la operación" reports — it throws one of these two
 * codes instead of a clean popup-blocked, and redirect sidesteps the whole
 * cross-window handoff since it's a plain top-level navigation.
 */
const POPUP_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
  "auth/internal-error",
  "auth/web-storage-unsupported",
]);

export type BackendRole = "client" | "admin" | "warehouse_operator";

export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: BackendRole;
}

type AuthContextValue = {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  /** Set once, right after mount, if a pending signInWithRedirect() came back with an error (e.g. the user denied consent). */
  redirectError: unknown;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Firebase auth error codes → user-facing Spanish messages. */
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Correo o contraseña incorrectos.";
    case "auth/email-already-in-use":
      return "Ya existe una cuenta con este correo. Inicia sesión.";
    case "auth/invalid-email":
      return "El correo no es válido.";
    case "auth/weak-password":
      return "La contraseña debe tener al menos 6 caracteres.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
    case "auth/popup-closed-by-user":
      return "Cerraste la ventana de Google antes de completar el inicio de sesión.";
    case "auth/network-request-failed":
      return "Sin conexión. Revisa tu internet e inténtalo de nuevo.";
    case "auth/account-exists-with-different-credential":
      return "Ya existe una cuenta con este correo usando contraseña. Inicia sesión con tu correo y contraseña.";
    default:
      // Not one of the codes above — log it so a recurring report can get a
      // precise fix instead of staying stuck behind this generic message.
      if (code) console.error("Unhandled Firebase auth error code:", code);
      return "No se pudo completar la operación. Inténtalo de nuevo.";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirectError, setRedirectError] = useState<unknown>(null);

  useEffect(() => {
    // Finalizes a pending signInWithRedirect() (the popup-blocked fallback)
    // and surfaces any error from it — onAuthStateChanged below still
    // picks up the resulting user on success either way.
    getRedirectResult(auth).catch((error) => setRedirectError(error));
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
        return;
      }
      try {
        const idToken = await firebaseUser.getIdToken();
        const synced = await apiFetch<UserProfile>("/auth/session", { method: "POST", idToken });
        setProfile(synced);
      } catch (error) {
        console.error("Failed to sync session with backend", error);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const code = (error as { code?: string })?.code ?? "";
      if (POPUP_FALLBACK_CODES.has(code)) {
        // Full-page navigation — the flow completes on the next load via
        // getRedirectResult() above, not by this function returning.
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      throw error;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const registerWithEmail = async (name: string, email: string, password: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    // displayName lands after account creation; sync so the backend profile
    // (created on the first /auth/session call) picks it up.
    await updateProfile(credential.user, { displayName: name.trim() });
    try {
      const idToken = await credential.user.getIdToken();
      const synced = await apiFetch<UserProfile>("/auth/session", { method: "POST", idToken });
      setProfile(synced);
    } catch {
      // Backend unreachable — the guard will retry the sync on next auth change.
    }
  };

  const signOutUser = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        redirectError,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        signOutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
