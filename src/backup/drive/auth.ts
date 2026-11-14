/**
 * Google Sign-In, requested only when the user turns backup on, and only
 * for the `drive.appdata` scope (the app's own hidden folder).
 */
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

let configured = false;

function configure(): void {
  if (configured) return;
  const webClientId = (
    Constants.expoConfig?.extra as { googleWebClientId?: string | null } | undefined
  )?.googleWebClientId;
  GoogleSignin.configure({
    scopes: [SCOPE],
    ...(webClientId ? { webClientId } : {}),
  });
  configured = true;
}

/** Shows the Google account chooser. Returns the account's email, or null if cancelled. */
export async function connectGoogle(): Promise<string | null> {
  configure();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (result.type !== 'success') return null;
  return result.data.user.email;
}

/** Restores the previous sign-in without any UI. Returns false if the user must sign in again. */
export async function resumeGoogle(): Promise<boolean> {
  configure();
  if (GoogleSignin.getCurrentUser()) return true;
  if (!GoogleSignin.hasPreviousSignIn()) return false;
  const result = await GoogleSignin.signInSilently();
  return result.type === 'success';
}

export async function getAccessToken(): Promise<string> {
  configure();
  if (!(await resumeGoogle())) throw new Error('Not signed in to Google');
  return (await GoogleSignin.getTokens()).accessToken;
}

/** Signs out and withdraws the app's access to the Drive folder. */
export async function disconnectGoogle(): Promise<void> {
  configure();
  try {
    await GoogleSignin.revokeAccess();
  } catch {
    // Already revoked or offline; signing out locally is still right.
  }
  await GoogleSignin.signOut();
}
