(() => {
  const container = document.getElementById('office-map');
  const status = container.querySelector('[role="status"]');
  const coordinates = [48.0159, 37.8028];

  function showError() {
    status.textContent = 'Не удалось загрузить карту. Откройте её по ссылке ниже.';
    container.replaceChildren(status);
  }

  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();

    const script = document.createElement('script');
    script.src = 'https://api-maps.yandex.ru/2.1/?apikey=57fa78d0-d71b-4ec5-9ed4-44c79324c5e6&lang=ru_RU';
    script.onerror = showError;
    script.onload = () => {
      const maps = window.ymaps;
      if (!maps) {
        showError();
        return;
      }

      maps.ready(() => {
        container.replaceChildren();
        const map = new maps.Map(container, {
          center: coordinates,
          zoom: 15,
          controls: ['zoomControl', 'fullscreenControl']
        });
        map.behaviors.disable('scrollZoom');
        map.geoObjects.add(new maps.Placemark(coordinates, {
          balloonContent: 'Офис Стартера'
        }));
      }, showError);
    };
    document.head.append(script);
  }, { rootMargin: '200px' });

  observer.observe(container);
})();
