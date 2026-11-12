<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { loadOfficeMaps, type OfficeMap } from '../shared/officeMaps';
const host = ref<HTMLElement>();
const canvas = ref<HTMLElement>();
const state = ref('loading');
let observer: IntersectionObserver | undefined;
let map: OfficeMap | undefined;
let disposed = false;
async function initialize() {
  observer?.disconnect();
  try {
    const maps = await loadOfficeMaps();
    if (disposed || !canvas.value) return;
    map = new maps.Map(canvas.value, { center: [48.0159, 37.8028], zoom: 15, controls: ['zoomControl', 'fullscreenControl'] });
    map.behaviors.disable('scrollZoom');
    map.geoObjects.add(new maps.Placemark([48.0159, 37.8028], { balloonContent: 'Офис Стартера' }));
    state.value = 'ready';
  } catch {
    map?.destroy();
    map = undefined;
    if (!disposed) state.value = 'error';
  }
}
onMounted(() => {
  if (!('IntersectionObserver' in window)) { void initialize(); return; }
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) void initialize();
  }, { rootMargin: '200px' });
  observer.observe(host.value!);
});
onBeforeUnmount(() => { disposed = true; observer?.disconnect(); map?.destroy(); });
</script>

<template>
  <div id="office-map" ref="host" class="footer__map-view office-map" role="region" aria-label="Карта офиса Стартера в Донецке">
    <div ref="canvas" class="office-map__canvas"></div>
    <p v-if="state !== 'ready'" role="status" class="office-map__status">{{ state === 'error' ? 'Не удалось загрузить карту. Откройте её в Яндекс Картах по ссылке ниже.' : 'Загрузка карты…' }}</p>
  </div>
</template>

<style scoped>
.office-map { position: relative; }
.office-map__canvas { width: 100%; height: 100%; }
.office-map__status { position: absolute; inset: 0; display: grid; place-content: center; padding: 20px; margin: 0; }
</style>
