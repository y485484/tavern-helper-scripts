import { useStore } from './store';
import { applyUpdates, formatApplyResult, getTargetWorldbookName, hashUpdates } from './世界书写入';
import type { NormalizedUpdate } from './解析';
import { extractBlocks, parseUpdateText } from './解析';

export type ProcessSource = 'auto' | 'rescan';

let task_chain: Promise<void> = Promise.resolve();

/** 串行执行任务, 避免多个楼层同时写入世界书 */
export function enqueueTask(task: () => Promise<void>): void {
  task_chain = task_chain.then(task).catch(error => {
    console.error('世界书自动更新: 任务执行失败', error);
    toastr.error(
      `处理世界书更新时发生错误: ${error instanceof Error ? error.message : String(error)}`,
      '世界书自动更新',
    );
  });
}

/** 处理指定楼层中的世界书更新标记 */
export async function processMessages(message_ids: number[], source: ProcessSource): Promise<void> {
  const store = useStore();
  const settings = store.settings;

  const worldbook_name = getTargetWorldbookName(settings);
  if (!worldbook_name) {
    if (source === 'rescan') {
      toastr.error('未找到目标世界书, 请在「世界书自动更新」设置中手动指定', '世界书自动更新');
    } else {
      console.warn('世界书自动更新: 未找到目标世界书, 已跳过本次更新');
    }
    return;
  }

  const chat_id = SillyTavern.getCurrentChatId();
  const summaries: string[] = [];

  for (const message_id of message_ids) {
    const chat_message = getChatMessages(message_id)[0];
    if (!chat_message || chat_message.role !== 'assistant') {
      continue;
    }

    const blocks = extractBlocks(chat_message.message);
    if (blocks.length === 0) {
      continue;
    }

    const updates: NormalizedUpdate[] = [];
    const parse_errors: string[] = [];
    for (const block of blocks) {
      const parsed = parseUpdateText(block);
      updates.push(...parsed.updates);
      parse_errors.push(...parsed.errors);
    }

    if (updates.length === 0) {
      if (parse_errors.length > 0) {
        toastr.warning(`楼层 ${message_id} 的更新标记解析失败:\n${parse_errors.join('\n')}`, '世界书自动更新');
      }
      continue;
    }

    const hash = hashUpdates(updates);
    if (store.getProcessedHash(chat_id, message_id) === hash) {
      continue;
    }

    const result = await applyUpdates(worldbook_name, updates, { auto_create: settings.auto_create });
    if (result.errors.length > 0) {
      toastr.error(`楼层 ${message_id} 写入世界书失败:\n${result.errors.join('\n')}`, '世界书自动更新');
      continue;
    }

    store.markProcessed(chat_id, message_id, hash);

    if (parse_errors.length > 0) {
      toastr.warning(`楼层 ${message_id} 部分更新解析失败:\n${parse_errors.join('\n')}`, '世界书自动更新');
    }
    const summary = formatApplyResult(result);
    if (summary) {
      summaries.push(`【楼层 ${message_id}】\n${summary}`);
    }
  }

  if (summaries.length > 0) {
    if (settings.notify) {
      toastr.success(summaries.join('\n\n'), `世界书「${worldbook_name}」已更新`);
    }
  } else if (source === 'rescan') {
    toastr.info('未发现需要处理的世界书更新标记', '世界书自动更新');
  }
}

/** 重扫最近若干楼层 */
export async function rescanRecentMessages(): Promise<void> {
  const store = useStore();
  const last_id = getLastMessageId();
  if (last_id < 0) {
    toastr.info('当前聊天还没有消息', '世界书自动更新');
    return;
  }
  const count = _.clamp(Math.round(store.settings.scan_count) || 20, 1, 100);
  const start = Math.max(0, last_id - count + 1);
  await processMessages(_.range(start, last_id + 1), 'rescan');
}

/** 清空当前聊天的处理记录 */
export function clearProcessedRecords(): void {
  const store = useStore();
  const chat_id = SillyTavern.getCurrentChatId();
  store.clearProcessed(chat_id);
  toastr.warning(
    '已清空当前聊天的处理记录; 再次重扫时所有楼层都会被重新处理, 「追加」类操作可能造成内容重复',
    '世界书自动更新',
  );
}
