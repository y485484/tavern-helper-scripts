<template>
  <div class="worldbook-auto-update-settings">
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>{{ `世界书自动更新` }}</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <div class="worldbook-auto-update-block flex-container">
          <label class="checkbox_label">
            <input v-model="settings.enabled" type="checkbox" />
            <span>启用自动更新</span>
          </label>
        </div>

        <div class="worldbook-auto-update-block flex-container">
          <label class="checkbox_label">
            <input v-model="settings.inject_enabled" type="checkbox" />
            <span>自动向 AI 注入格式说明 (无需手动写进预设)</span>
          </label>
        </div>

        <div class="worldbook-auto-update-block flex-container">
          <label>
            目标世界书:
            <select v-model="settings.worldbook_mode" class="text_pole">
              <option value="auto">自动 (角色卡绑定的主世界书)</option>
              <option value="manual">手动指定</option>
            </select>
          </label>
        </div>

        <div v-if="settings.worldbook_mode === 'manual'" class="worldbook-auto-update-block flex-container">
          <label>
            世界书名称:
            <select v-model="settings.worldbook_name" class="text_pole">
              <option value="">-- 请选择世界书 --</option>
              <option v-for="name in worldbook_names" :key="name" :value="name">{{ name }}</option>
            </select>
          </label>
          <input class="menu_button" type="submit" value="刷新列表" @click="refreshWorldbooks" />
        </div>

        <div class="worldbook-auto-update-block flex-container">
          <label class="checkbox_label">
            <input v-model="settings.auto_create" type="checkbox" />
            <span>条目不存在时自动新建 (蓝灯常量条目)</span>
          </label>
        </div>

        <div class="worldbook-auto-update-block flex-container">
          <label>
            重扫楼层数:
            <input v-model.number="settings.scan_count" class="text_pole" type="number" min="1" max="100" />
          </label>
        </div>

        <div class="worldbook-auto-update-block flex-container">
          <label class="checkbox_label">
            <input v-model="settings.notify" type="checkbox" />
            <span>更新后显示通知</span>
          </label>
        </div>

        <div class="worldbook-auto-update-block flex-container">
          <input class="menu_button" type="submit" value="立即重扫最近楼层" @click="handle_rescan" />
          <input class="menu_button" type="submit" value="清空本聊天处理记录" @click="handle_clear" />
        </div>

        <div class="worldbook-auto-update-block">
          <small>
            已处理楼层数: {{ processed_count }} / 500。清空记录后重扫会重新处理所有楼层, 「追加」操作可能重复。
          </small>
        </div>

        <hr class="sysHR" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, onMounted, ref } from 'vue';
import { clearProcessedRecords, enqueueTask, rescanRecentMessages } from './处理器';
import { useStore } from './store';

const { settings } = storeToRefs(useStore());

const worldbook_names = ref<string[]>([]);
const processed_count = computed(() => {
  const chat_id = SillyTavern.getCurrentChatId();
  return useStore().countProcessed(chat_id);
});

function refreshWorldbooks() {
  try {
    worldbook_names.value = getWorldbookNames();
  } catch (error) {
    console.warn('世界书自动更新: 获取世界书列表失败', error);
  }
}

function handle_rescan() {
  enqueueTask(rescanRecentMessages);
}

function handle_clear() {
  clearProcessedRecords();
}

onMounted(() => {
  refreshWorldbooks();
});
</script>

<style scoped>
.worldbook-auto-update-block {
  margin-bottom: 5px;
}

.worldbook-auto-update-block label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.worldbook-auto-update-block small {
  opacity: 0.75;
}
</style>
