import { createScriptIdDiv, teleportStyle } from '@util/script';
import { pinia, useStore } from './store';
import { enqueueTask, processMessages, rescanRecentMessages } from './处理器';
import { FORMAT_GUIDE } from './解析';
import 设置界面 from './设置界面.vue';

const RESCAN_BUTTON = '重扫世界书更新';
const COPY_GUIDE_BUTTON = '复制世界书更新格式';

$(() => {
  setActivePinia(pinia);
  const store = useStore();

  // 把设置面板挂载到酒馆扩展设置区
  const app = createApp(设置界面).use(pinia);
  const $app = createScriptIdDiv().appendTo('#extensions_settings2');
  app.mount($app[0]);
  const { destroy } = teleportStyle();

  $(window).on('pagehide', () => {
    app.unmount();
    $app.remove();
    destroy();
  });

  // 脚本按钮
  appendInexistentScriptButtons([
    { name: RESCAN_BUTTON, visible: true },
    { name: COPY_GUIDE_BUTTON, visible: true },
  ]);

  eventOn(getButtonEvent(RESCAN_BUTTON), errorCatched(() => enqueueTask(rescanRecentMessages)));

  eventOn(
    getButtonEvent(COPY_GUIDE_BUTTON),
    errorCatched(() => {
      builtin.copyText(FORMAT_GUIDE);
      toastr.success('已复制世界书更新格式说明, 可粘贴到预设或总结提示词中', '世界书自动更新');
    }),
  );

  // 自动处理 AI 回复中的更新标记
  eventOn(
    tavern_events.MESSAGE_RECEIVED,
    errorCatched((message_id: number) => {
      if (!store.settings.enabled) {
        return;
      }
      enqueueTask(() => processMessages([message_id], 'auto'));
    }),
  );

  const worldbook_desc =
    store.settings.worldbook_mode === 'manual'
      ? store.settings.worldbook_name || '(未指定)'
      : `(自动) ${store.settings.worldbook_name || '角色卡绑定世界书'}`;
  console.info(`[${getScriptName()}] 世界书自动更新脚本已加载, 目标世界书: ${worldbook_desc}`);
});
