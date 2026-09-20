import _ from "lodash";
import { createPinia, defineStore } from "pinia";
import { ref, watchEffect } from "vue";

const SettingsSchema = z
  .object({
    enabled: z.boolean().default(true),
    inject_enabled: z.boolean().default(true),
    worldbook_mode: z.enum(['auto', 'manual']).default('auto'),
    worldbook_name: z.string().default(''),
    auto_create: z.boolean().default(true),
    scan_count: z
      .coerce.number()
      .transform(value => _.clamp(Math.round(value), 1, 100))
      .default(20),
    notify: z.boolean().default(true),
  })
  .prefault({});

const ProcessedSchema = z.record(z.string(), z.record(z.string(), z.string())).prefault({});

export type Settings = z.infer<typeof SettingsSchema>;

/** 该脚本共享的 pinia 实例 */
export const pinia = createPinia();

/** 世界书自动更新脚本的全局状态: 用户设置与各聊天的处理记录 */
export const useStore = defineStore('世界书自动更新', () => {
  const raw_variables = getVariables({ type: 'script', script_id: getScriptId() });
  const settings = ref(SettingsSchema.parse(raw_variables.settings));
  const processed = ref(ProcessedSchema.parse(raw_variables.processed));

  watchEffect(() => {
    replaceVariables(
      { settings: klona(settings.value), processed: klona(processed.value) },
      { type: 'script', script_id: getScriptId() },
    );
  });

  /** 获取某楼层已处理的更新哈希; 未处理过则返回 undefined */
  function getProcessedHash(chat_id: string, message_id: number): string | undefined {
    return _.get(processed.value, [chat_id, String(message_id)]);
  }

  /** 记录某楼层的更新已被处理, 防止重复写入世界书 */
  function markProcessed(chat_id: string, message_id: number, hash: string) {
    _.set(processed.value, [chat_id, String(message_id)], hash);

    const records = _.get(processed.value, [chat_id]) as Record<string, string> | undefined;
    if (!records) {
      return;
    }
    const ids = Object.keys(records)
      .map(Number)
      .filter(Number.isFinite)
      .sort((lhs, rhs) => lhs - rhs);
    if (ids.length <= 500) {
      return;
    }
    const keep = new Set(ids.slice(-500).map(String));
    for (const key of Object.keys(records)) {
      if (!keep.has(key)) {
        delete records[key];
      }
    }
  }

  /** 清空某个聊天的处理记录 */
  function clearProcessed(chat_id: string) {
    _.unset(processed.value, [chat_id]);
  }

  /** 统计某个聊天已处理的楼层数 */
  function countProcessed(chat_id: string): number {
    const records = _.get(processed.value, [chat_id]) as Record<string, string> | undefined;
    return records ? Object.keys(records).length : 0;
  }

  return { settings, processed, getProcessedHash, markProcessed, clearProcessed, countProcessed };
});
