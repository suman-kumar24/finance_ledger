/**
 * Google Drive REST client for the app's private "appDataFolder".
 *
 * THIS IS THE ONLY FILE IN THE APP THAT MAKES NETWORK REQUESTS, and it only
 * ever talks to www.googleapis.com. The lint rule in eslint.config.js and
 * the test in test/guards/network.test.ts enforce both.
 *
 * The app-data folder is hidden from the user's normal Drive view and can
 * only be read by this app (scope: drive.appdata). The app cannot see any
 * other file in the user's Drive.
 */
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export interface DriveFile {
  id: string;
  name: string;
  /** Epoch milliseconds. */
  createdTime: number;
  size: number;
}

export class DriveError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

async function check(response: Response): Promise<Response> {
  if (response.ok) return response;
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 200);
  } catch {
    // ignore
  }
  throw new DriveError(response.status, `Drive request failed (${response.status}) ${detail}`);
}

export function createDriveClient(getToken: () => Promise<string>, fetchImpl: Fetch = fetch) {
  const authorised = async (url: string, init: RequestInit = {}) => {
    const token = await getToken();
    return check(
      await fetchImpl(url, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${token}`,
        },
      }),
    );
  };

  return {
    /** Backups in the app-data folder, newest first. */
    async list(): Promise<DriveFile[]> {
      const query = [
        'spaces=appDataFolder',
        'pageSize=100',
        `fields=${encodeURIComponent('files(id,name,createdTime,size)')}`,
        'orderBy=createdTime%20desc',
      ].join('&');
      const response = await authorised(`${API}?${query}`);
      const body = (await response.json()) as {
        files?: { id: string; name: string; createdTime: string; size?: string }[];
      };
      return (body.files ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        createdTime: Date.parse(f.createdTime),
        size: Number(f.size ?? 0),
      }));
    },

    /** Uploads a JSON document into the app-data folder. */
    async upload(name: string, content: string): Promise<DriveFile> {
      const boundary = `ledger${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
      const metadata = JSON.stringify({
        name,
        parents: ['appDataFolder'],
        mimeType: 'application/json',
      });
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
      const response = await authorised(
        `${UPLOAD}?uploadType=multipart&fields=${encodeURIComponent('id,name,createdTime,size')}`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body,
        },
      );
      const f = (await response.json()) as {
        id: string;
        name: string;
        createdTime: string;
        size?: string;
      };
      return {
        id: f.id,
        name: f.name,
        createdTime: Date.parse(f.createdTime),
        size: Number(f.size ?? 0),
      };
    },

    async download(id: string): Promise<string> {
      const response = await authorised(`${API}/${encodeURIComponent(id)}?alt=media`);
      return response.text();
    },

    async remove(id: string): Promise<void> {
      await authorised(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}

export type DriveClient = ReturnType<typeof createDriveClient>;
