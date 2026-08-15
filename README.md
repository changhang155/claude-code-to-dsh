# claude-code-to-dsh

把 Claude Code 的会话 JSONL(`~/.claude/projects/...`)提取成**可续接的上下文**,而不是回放事件。

设计哲学(方案 A:context import,非 session migration):

- ✅ 提取**自动摘要链**(`summary` 行,即 `claude --resume` 标题的来源)、首条真实用户消息、**动过的文件**(Write/Edit/Read 足迹)、会话尾部状态。
- ❌ 不做逐事件回放:工具调用本身没有续接价值,状态已经落在 git 工作树里;把 112MB 事件流塞进 DSH 事件格式只会变成一份没人读的转录,而且 DSH 内部格式(header 强校验 + `SESSION_FORMAT_VERSION` 门禁)在 rc 阶段随时会变。

产出两种形态:

1. **续接文档**(`export`)—— 一份 markdown,含上下文链、文件足迹、尾部状态、未完成线索,可直接存档或作为任务简报。
2. **开场上下文块**(`seed`)—— 一段纯文本,粘贴进新的 DSH(DeepSeek Harness)会话开头,让新会话无缝接手旧 Claude Code 会话的工作。

## 安装

零依赖,Python ≥ 3.10:

```bash
pip install -e .            # 提供 claude-code-to-dsh 命令
# 或不安装,直接:
python -m claude_code_to_dsh list
```

## DSH 插件(Web GUI 一键导入)

`dsh-plugin/` 是一个 DeepSeek Harness 插件,把上面的能力直接搬进 DSH Web GUI。它已抽成可独立发布的包 `dsh-plugin-claude-import`(本目录即其工作副本;包内声明了 `dsh.bundle`,支持 `dsh plugin --profile web add dsh-plugin-claude-import` 一键安装,详见包内 `README.md`):

- **agent 工具**(host 半区):
  - `claude_session_list` —— 列出 `~/.claude/projects` 下所有会话(ID/项目/标题/时间/统计)
  - `claude_session_import` —— 导入指定会话,返回 seed 开场上下文或完整 markdown 续接文档;`createSession=true` 时在 Claude 会话所属项目目录新建 DSH 会话,并把上下文作为首条消息投递
- **Web UI**(client 半区):会话头部新增「Claude 导入」入口 —— 输入会话 ID(留空 = 最近一个),自动新建并切换 DSH 会话,agent 工具接管并汇报。

本地开发时直接装本目录(需要 pnpm,可用 `corepack enable pnpm` 启用):

```bash
cd ~/.dsh/profiles/web
pnpm add /Users/ch/code/claude-code-to-dsh/dsh-plugin
# 开发机:为插件的 peer 依赖建立软链(或把 @deepseek-ai/dsh-tools、@deepseek-ai/schemastery 装进 profile)
mkdir -p /Users/ch/code/claude-code-to-dsh/dsh-plugin/node_modules/@deepseek-ai
ln -s <dsh安装目录>/node_modules/@deepseek-ai/dsh-tools    /Users/ch/code/claude-code-to-dsh/dsh-plugin/node_modules/@deepseek-ai/dsh-tools
ln -s <dsh安装目录>/node_modules/@deepseek-ai/schemastery /Users/ch/code/claude-code-to-dsh/dsh-plugin/node_modules/@deepseek-ai/schemastery
```

然后在 `~/.dsh/profiles/web/cordis.patch.yml` 注册:

```yaml
- insert:
    - id: claude-import
      name: 'dsh-plugin-claude-import'
```

**重启 dsh web 生效**(`dsh web` 无 dev watcher 时需重启进程;client 半区由 host 按需 serve,无需重建前端产物)。验证:`dsh --profile web --dump-config | grep claude` 应看到 `claude-import`。

## 用法

```bash
# 列出所有会话(最新在前)
claude-code-to-dsh list

# 导出某个会话的续接文档
claude-code-to-dsh export f1728cdc -o out/f1728cdc.md
claude-code-to-dsh export ~/.claude/projects/-Users-ch-code-xushang-code/f1728cdc-....jsonl

# 生成粘贴进 DSH 新会话的开场上下文块
claude-code-to-dsh seed f1728cdc
claude-code-to-dsh seed f1728cdc -o out/f1728cdc-seed.txt

# 会话根目录不在默认位置时
claude-code-to-dsh --projects-root /path/to/projects list
```

`session` 参数接受会话 ID 前缀(如 `f1728cdc`)或完整的 `.jsonl` 路径。

## 输出示例

`export` 的 markdown 长这样:

```markdown
# 会话续接文档:staging-api 排障

## 会话元信息
- 项目目录:`/Users/ch/code/xushang-code`
- 时间范围:...
- 消息统计:user × 42 / assistant × 51 / tool_call × 300 / tool_error × 12

## 上下文链(自动摘要,新→旧)
1. 已定位到 ...
2. 尝试了 ...
3. 待验证 ...

## 动过的文件(Write/Edit)
- `services/agents/master-agent/...` — Write, Edit

## 会话尾部状态
最近用户消息:...
最后一条助手回复:...

## 未完成线索
...
```

## 测试

```bash
python -m unittest discover -s tests -v
```

## 后续方向

- ✅ 正式 DSH 插件化:Web GUI 一个入口完成 列表 → 挑选 → 播种 新会话(见上节 `dsh-plugin/`,已支持 `dsh plugin add` 安装)。
- ✅ `seed` 直接对接 DSH 的会话创建 API:`claude_session_import` 的 `createSession=true` 会在 Claude 会话所属项目目录新建 DSH 会话并投递上下文,不再是剪贴板粘贴。
- ✅ 插件发布:`dsh-plugin-claude-import` 已推送到独立仓库 [github.com/changhang155/dsh-plugin-claude-import](https://github.com/changhang155/dsh-plugin-claude-import) 并打上 `dsh-plugin` topic;npm 发布待 `npm login` 后执行 `npm publish`。

## License

MIT
