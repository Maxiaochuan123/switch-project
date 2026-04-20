/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-expect-error: @vercel/node is only available in Vercel environment
// eslint-disable-next-line import/no-unresolved
import { VercelRequest, VercelResponse } from '@vercel/node';

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  body: string;
  published_at: string;
  assets: GitHubAsset[];
}

interface UpdateResponse {
  version: string;
  notes: string;
  pub_date: string;
  platforms: {
    [key: string]: {
      url: string;
      signature: string;
    };
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { current_version } = req.query;

  const OWNER = 'Maxiaochuan123';
  const REPO = 'switch-project';

  try {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Tauri-Updater-Vercel',
      },
    });

    if (!response.ok) {
        return res.status(response.status).json({ message: 'Failed to fetch release from GitHub' });
    }

    const release: GitHubRelease = await response.json() as GitHubRelease;
    
    const updateResponse: UpdateResponse = {
      version: release.tag_name.replace(/^v/, ''),
      notes: release.body,
      pub_date: release.published_at,
      platforms: {},
    };

    for (const asset of release.assets) {
      const name = asset.name;
      
      if (name.endsWith('.sig')) {
        const baseName = name.replace('.sig', '');
        const targetAsset = release.assets.find((a: GitHubAsset) => a.name === baseName);
        if (targetAsset) {
            const platform = getPlatformKey(baseName);
            if (platform) {
                const sigResponse = await fetch(asset.browser_download_url);
                const signature = await sigResponse.text();
                
                updateResponse.platforms[platform] = {
                    url: targetAsset.browser_download_url,
                    signature: signature.trim(),
                };
            }
        }
      }
    }

    if (current_version === updateResponse.version) {
        return res.status(204).send('');
    }

    return res.status(200).json(updateResponse);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
}

function getPlatformKey(filename: string): string | null {
    if (filename.includes('x64') && filename.includes('msi')) return 'windows-x86_64';
    if (filename.includes('x64') && filename.includes('AppImage')) return 'linux-x86_64';
    if (filename.includes('aarch64') && filename.includes('AppImage')) return 'linux-aarch64';
    if (filename.includes('x64') && filename.includes('app.tar.gz')) return 'darwin-x86_64';
    if (filename.includes('aarch64') && filename.includes('app.tar.gz')) return 'darwin-aarch64';
    return null;
}
