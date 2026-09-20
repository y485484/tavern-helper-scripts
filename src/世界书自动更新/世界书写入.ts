import type { Settings } from './store';
import type { NormalizedUpdate } from './解析';

export type ApplyResult = {
  worldbook_name: string;
  applied: NormalizedUpdate[];
  created: string[];
  removed: string[];
  missing: string[];
  errors: string[];
};

/** 根据脚本设置解析目标世界书名称 */
export function getTargetWorldbookName(settings: Settings): string {
  if (settings.worldbook_mode === 'manual') {
    return settings.worldbook_name.trim();
  }

  const char_worldbooks = getCharWorldbookNames('current');
  if (char_worldbooks.primary) {
    return char_worldbooks.primary;
  }
  if (char_worldbooks.additional.length > 0) {
    return char_worldbooks.additional[0];
  }
  const chat_worldbook = getChatWorldbookName('current');
  if (chat_worldbook) {
    return chat_worldbook;
  }
  return '';
}

/** 把一组更新写入世界书 */
export async function applyUpdates(
  worldbook_name: string,
  updates: NormalizedUpdate[],
  { auto_create }: { auto_create: boolean },
): Promise<ApplyResult> {
  const result: ApplyResult = {
    worldbook_name,
    applied: [],
    created: [],
    removed: [],
    missing: [],
    errors: [],
  };

  if (!worldbook_name) {
    result.errors.push('未找到目标世界书, 请在脚本设置中指定世界书');
    return result;
  }

  if (!getWorldbookNames().includes(worldbook_name)) {
    if (!auto_create) {
      result.errors.push(`世界书「${worldbook_name}」不存在`);
      return result;
    }
    await createWorldbook(worldbook_name);
  }

  const pending_created: NormalizedUpdate[] = [];

  try {
    await updateWorldbookWith(worldbook_name, entries => {
      for (const update of updates) {
        const index = entries.findIndex(entry => entry.name === update.name);

        if (index === -1) {
          if (update.action === '删除') {
            result.missing.push(update.name);
            continue;
          }
          if (auto_create) {
            mergePendingContent(pending_created, update);
          } else {
            result.missing.push(update.name);
          }
          continue;
        }

        const entry = entries[index];
        switch (update.action) {
          case '删除':
            entries.splice(index, 1);
            result.removed.push(update.name);
            break;
          case '替换':
            entry.content = update.content;
            result.applied.push(update);
            break;
          case '追加':
            entry.content = entry.content ? `${entry.content}\n${update.content}` : update.content;
            result.applied.push(update);
            break;
          case '前置':
            entry.content = entry.content ? `${update.content}\n${entry.content}` : update.content;
            result.applied.push(update);
            break;
        }
      }
      return entries;
    });

    if (pending_created.length > 0) {
      const { new_entries } = await createWorldbookEntries(
        worldbook_name,
        pending_created.map(update => ({
          name: update.name,
          content: update.content,
          enabled: true,
          strategy: {
            type: 'constant',
            keys: [],
            keys_secondary: { logic: 'and_any', keys: [] },
            scan_depth: 'same_as_global',
          },
        })),
      );
      result.created.push(...new_entries.map(entry => entry.name));
    }
  } catch (error) {
    result.errors.push(`写入世界书失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/** 同一批次中同一新条目被多次更新时, 按操作类型合并内容 */
function mergePendingContent(pending: NormalizedUpdate[], update: NormalizedUpdate): void {
  const existing = pending.find(item => item.name === update.name);
  if (!existing) {
    pending.push({ ...update });
    return;
  }
  switch (update.action) {
    case '替换':
      existing.content = update.content;
      break;
    case '追加':
      existing.content = existing.content ? `${existing.content}\n${update.content}` : update.content;
      break;
    case '前置':
      existing.content = existing.content ? `${update.content}\n${existing.content}` : update.content;
      break;
    case '删除':
      break;
  }
}

/** 计算一组更新的内容哈希, 用于避免重复写入 */
export function hashUpdates(updates: NormalizedUpdate[]): string {
  const text = JSON.stringify(updates);
  let hash = 5381;
  for (let index = 0; index < text.length; index++) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

/** 把写入结果格式化为可读文本 */
export function formatApplyResult(result: ApplyResult): string {
  const lines: string[] = [];
  if (result.applied.length > 0) {
    lines.push(`✏️ 更新 ${result.applied.length} 个条目: ${result.applied.map(update => update.name).join(', ')}`);
  }
  if (result.created.length > 0) {
    lines.push(`➕ 新建 ${result.created.length} 个条目: ${result.created.join(', ')}`);
  }
  if (result.removed.length > 0) {
    lines.push(`🗑️ 删除 ${result.removed.length} 个条目: ${result.removed.join(', ')}`);
  }
  if (result.missing.length > 0) {
    lines.push(`⚠️ 以下条目不存在, 已跳过: ${result.missing.join(', ')}`);
  }
  if (result.errors.length > 0) {
    lines.push(`❌ ${result.errors.join('; ')}`);
  }
  return lines.join('\n');
}
