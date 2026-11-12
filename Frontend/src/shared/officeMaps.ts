export interface OfficeMap {
  behaviors: { disable(name: string): void };
  geoObjects: { add(object: unknown): void };
  destroy(): void;
}
interface MapsApi {
  ready(success: () => void, failure: () => void): void;
  Map: new (element: HTMLElement, options: object) => OfficeMap;
  Placemark: new (coordinates: number[], properties: object) => unknown;
}
declare global { interface Window { ymaps?: MapsApi } }
let loading: Promise<MapsApi> | undefined;
export function loadOfficeMaps(): Promise<MapsApi> {
  return loading ??= new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.removeEventListener('load', ready);
      script.removeEventListener('error', failed);
      if (error) reject(error);
      else resolve(window.ymaps!);
    };
    const failed = () => finish(new Error('Yandex Maps unavailable'));
    const ready = () => {
      try {
        if (!window.ymaps) return failed();
        window.ymaps.ready(() => finish(), failed);
      } catch { failed(); }
    };
    const timer = window.setTimeout(failed, 15000);
    const existing = document.querySelector<HTMLScriptElement>('script[src*="api-maps.yandex.ru/2.1/"]');
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', ready);
    script.addEventListener('error', failed);
    if (window.ymaps) ready();
    else if (!existing) {
      script.src = 'https://api-maps.yandex.ru/2.1/?apikey=a604765d-9320-44df-935c-5a9600938a9e&lang=ru_RU&csp=true';
      script.async = true;
      document.head.append(script);
    }
  });
}
