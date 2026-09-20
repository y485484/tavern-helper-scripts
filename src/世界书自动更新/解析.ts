import { parseString } from '@util/common';

/** 更新标记的 XML 标签名 */
export const UPDATE_TAG = '世界书更新';

export type UpdateAction = '替换' | '追加' | '前置' | '删除';

export type NormalizedUpdate = {
  name: string;
  action: UpdateAction;
  content: string;
};

const NAME_KEYS = ['条目', '名称', '条目标题', '标题', 'entry', 'name'];
const ACTION_KEYS = ['操作', '动作', '修改方式', 'action', 'op'];
const CONTENT_KEYS = ['内容', '文本', '正文', 'content', 'text'];

const ACTION_ALIASES: Record<string, UpdateAction> = {
  覆盖: '替换',
  更新: '替换',
  替换: '替换',
  replace: '替换',
  set: '替换',
  追加: '追加',
  添加: '追加',
  新增: '追加',
  append: '追加',
  add: '追加',
  前置: '前置',
  前插: '前置',
  prepend: '前置',
  删除: '删除',
  移除: '删除',
  delete: '删除',
  remove: '删除',
};

/** 世界书更新的格式说明; 既用于「复制世界书更新格式」按钮, 也用于自动注入给 AI 的提示词 */
export const FORMAT_GUIDE = `【世界书更新】
当剧情发展导致角色信息、人设、关系、状态、能力等发生变化, 或发生重要事件需要记录时, 在回复末尾输出以下标记来更新世界书 (条目须已存在于世界书中, 标题须完全一致):

<${UPDATE_TAG}>
- 条目: 目标条目的标题
  操作: 替换
  内容: |-
    替换后的完整内容
- 条目: 另一个条目的标题
  操作: 追加
  内容: |-
    追加到该条目末尾的内容
</${UPDATE_TAG}>

可用操作:
- 替换: 用「内容」完全替换条目的原有内容, 适合修改角色信息、人设
- 追加: 把「内容」追加到条目末尾, 适合补充经历、事件记录
- 前置: 把「内容」插入到条目开头
- 删除: 删除该条目, 无需填写「内容」

注意事项:
- 一次可以列出多个条目更新, 会按顺序执行
- 「内容」支持多行文本, 请使用 YAML 的 |- 块语法书写
- 仅在信息确实发生变化时输出, 不要重复输出没有变化的条目`;

/** 从消息文本中提取所有 <世界书更新> 标记块的内部内容 */
export function extractBlocks(text: string): string[] {
  const regex = new RegExp(`<${UPDATE_TAG}>([\\s\\S]*?)<\\/${UPDATE_TAG}>`, 'g');
  return [...text.matchAll(regex)].map(match => match[1]);
}

/** 解析一个标记块内容, 得到标准化后的更新列表; 解析失败的条目会记录在 errors 中 */
export function parseUpdateText(text: string): { updates: NormalizedUpdate[]; errors: string[] } {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = parseString(text);
  } catch (error) {
    return {
      updates: [],
      errors: [`无法解析更新内容: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const updates: NormalizedUpdate[] = [];
  for (const item of toItemList(parsed, errors)) {
    const update = normalizeItem(item, errors);
    if (update) {
      updates.push(update);
    }
  }
  return { updates, errors };
}

function toItemList(parsed: unknown, errors: string[]): unknown[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (_.isPlainObject(parsed)) {
    const object = parsed as Record<string, unknown>;
    if (NAME_KEYS.some(key => key in object)) {
      return [object];
    }
    const entries = Object.entries(object);
    if (entries.length > 0 && entries.every(([, value]) => _.isPlainObject(value))) {
      return entries.map(([name, value]) => ({ 条目: name, ...(value as Record<string, unknown>) }));
    }
  }
  errors.push(`无法识别的更新格式: ${brief(parsed)}`);
  return [];
}

function normalizeItem(raw: unknown, errors: string[]): NormalizedUpdate | null {
  if (!_.isPlainObject(raw)) {
    errors.push(`条目更新应为对象: ${brief(raw)}`);
    return null;
  }
  const object = raw as Record<string, unknown>;
  const name = pickString(object, NAME_KEYS)?.trim();
  if (!name) {
    errors.push(`缺少条目名称: ${brief(raw)}`);
    return null;
  }
  const raw_action = pickString(object, ACTION_KEYS)?.trim().toLowerCase() ?? '';
  const action = raw_action ? ACTION_ALIASES[raw_action] : '追加';
  if (!action) {
    errors.push(`条目「${name}」使用了未知操作「${raw_action}」`);
    return null;
  }
  const content = pickContent(object)?.trim() ?? '';
  if (action !== '删除' && !content) {
    errors.push(`条目「${name}」的「${action}」操作缺少内容`);
    return null;
  }
  return { name, action, content };
}

function pickString(object: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
  }
  return undefined;
}

function pickContent(object: Record<string, unknown>): string | undefined {
  for (const key of CONTENT_KEYS) {
    if (!(key in object)) {
      continue;
    }
    const value = object[key];
    if (value == null) {
      continue;
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    try {
      return YAML.stringify(value).trimEnd();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function brief(value: unknown): string {
  try {
    const text = typeof value === 'string' ? value : YAML.stringify(value).trimEnd();
    return _.truncate(text.replace(/\s+/g, ' '), { length: 120 });
  } catch {
    return String(value);
  }
}
