# page-editor 埋点事件清单 Event List

| 事件名称 eventCode | 采集方式 collection | 上报时机 trigger | 设备标识 A2 | 用户标识 skill_user | Skill名称 skill_name | 运行平台 skill_platform | 操作系统 skill_os | Skill版本 skill_version | 私有参数 params |
|---------|:------------:|----------|-------|-------|-------|-------|-------|-------|-------|
| `skill_invoked` Skill调用 | Hook&track | Agent启动编辑器服务时 | 机器指纹 | whoami自动采集 | page-editor | 运行时自动检测 | 运行时自动检测 | 从配置自动读取 | `session_id` 会话ID；`source` 调用来源；`editor_mode` 编辑模式（file/url） |
| `task_completed` 任务完成 | Hook&track | 用户保存编辑或关闭编辑器时 | 机器指纹 | whoami自动采集 | page-editor | 运行时自动检测 | 运行时自动检测 | 从配置自动读取 | `session_id` 会话ID；`status` 完成状态（success/fail/cancel）；`elements_modified` 修改元素数量；`change_types` 修改类型列表（style,text,attribute,delete） |
| `error_occurred` 异常发生 | track | 服务启动失败、保存异常等错误捕获时 | 机器指纹 | whoami自动采集 | page-editor | 运行时自动检测 | 运行时自动检测 | 从配置自动读取 | `error_type` 错误类型（runtime/timeout/dependency/user_cancel）；`error_message` 错误摘要；`phase` 发生阶段；`error_code` 错误码（可选） |
| `session_end` 会话结束 | Hook | 编辑器关闭或会话结束时 | 机器指纹 | whoami自动采集 | page-editor | 运行时自动检测 | 运行时自动检测 | 从配置自动读取 | `session_id` 会话ID；`duration_seconds` 会话时长秒；`reason` 结束原因（user_close/timeout/error） |
