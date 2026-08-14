/**
 * Document Picture-in-Picture: a genuinely always-on-top OS window rendering
 * our own DOM, from a plain web app. This is what makes the "floating drop
 * target that's always on screen" possible without shipping a native binary.
 *
 * Chromium desktop only (Chrome/Edge 116+).
 */

interface DocumentPipApi {
  requestWindow(options: { width: number; height: number }): Promise<Window>;
  window: Window | null;
}

function api(): DocumentPipApi | undefined {
  return (window as unknown as { documentPictureInPicture?: DocumentPipApi })
    .documentPictureInPicture;
}

export function isPipSupported(): boolean {
  return Boolean(api());
}

export async function openPipWindow(width = 340, height = 380): Promise<Window> {
  const pipApi = api();
  if (!pipApi) {
    throw new Error(
      'This browser has no Picture-in-Picture window support. Use Chrome or Edge on desktop.',
    );
  }

  const pip = await pipApi.requestWindow({ width, height });

  // The PiP window starts with an empty document, so our stylesheets have to be
  // carried across by hand or everything renders unstyled.
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
      const style = pip.document.createElement('style');
      style.textContent = css;
      pip.document.head.append(style);
    } catch {
      // cssRules throws on cross-origin sheets; re-link those by URL instead.
      if (sheet.href) {
        const link = pip.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        pip.document.head.append(link);
      }
    }
  }

  pip.document.body.style.margin = '0';
  pip.document.body.style.background = 'var(--bg)';
  return pip;
}
