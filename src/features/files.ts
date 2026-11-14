import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Writes text to a private cache file and opens the Android share sheet,
 * so the user chooses where it goes (Files, email, another app). The app
 * itself sends nothing anywhere.
 */
export async function shareTextFile(
  name: string,
  text: string,
  mimeType: string,
): Promise<boolean> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(text);
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
  return true;
}

/** Lets the user pick one file and returns its name and text, or null if cancelled. */
export async function pickTextFile(
  types: string[],
): Promise<{ name: string; text: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: types,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const text = await new File(asset.uri).text();
  return { name: asset.name, text };
}
