<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue';
const props = withDefaults(defineProps<{ kind?: 'wordmark' | 'cat-outline' | 'cat-mask' }>(), { kind: 'wordmark' });
const dark = inject<Ref<boolean>>('brand-dark', ref(false));
const source = computed(() => `/images/branding/starter-${props.kind}-on-${dark.value ? 'dark' : 'light'}.webp`);
</script>
<template><img :src="source" /></template>
