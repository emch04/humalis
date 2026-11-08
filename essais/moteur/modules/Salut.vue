<script setup>
import { ref } from 'vue';
defineProps(['nom']);
const clics = ref(0);
</script>
<template>
  <button type="button" @click="clics++">Vue {{ nom }} {{ clics }}</button>
</template>
