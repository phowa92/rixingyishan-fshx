# 日行一善 · 放生回向

独立的 Netlify + Supabase 网站。首页使用提供的海景图；视觉延续 phowa 的宋体、宣纸白、墨色和金棕点缀。页面包括首页、填写、提交完成、名单展示和管理后台。独立的 Netlify 站点已建立为 `rixingyishan-huixiang.netlify.app`，尚未连接新数据库或发布。

## 已实现

- 往生者（亡者／堕胎婴灵／旁生）、病患、祈福三大类；填写页按大类显示原文回向文。
- 同批不限行姓名输入、空白校验、一次批量提交；每次填写都存为独立记录，包括同批或跨批重复姓名。前台按同一细分类姓名只显示最近填写的一条，后台逐条显示原始填写。
- 展示页固定三个标签及当前有效数量；往生者分子类显示；姓名以顿号连接。
- 北京时间每日 00:00 清理。按指定示例，11 月 12 日清理时删除 11 月 5 日 00:00 **以前**的记录。展示查询也用同一边界。
- 管理后台使用 Supabase Auth 邮箱密码；账户须在 `admin_accounts` 授权表中。支持搜索、翻页、CSV 下载、记录新增/编辑/删除、管理员账户新增/删除/改密及清理日志。忘记密码时发送邮箱验证码，核对后一次显示临时密码。
- App 不存储填写人的姓名以外身份信息；后台密钥只供 Netlify Functions 使用，不写入前端。

## 运行前配置

### 先看本地预览

在项目目录执行 `node scripts/preview.mjs`，打开 `http://127.0.0.1:8765`。预览仅绑定本机，不连接 Supabase，也不发送真实邮件。预览名单保存在本地 `data/preview-records.json`（已忽略 Git），重启后仍在；预览管理员账户只保存在进程内，重启后恢复为测试账号 `preview@example.com`／密码 `PreviewOnly123!`。预览后台地址为 `/admin`。预览找回密码时验证码会显示在页面上，正式部署时才会发邮件。

### 正式部署

1. 创建**独立的** Supabase 项目，不复用 phowa 数据库。将本目录链接至新项目，再用 Supabase CLI 应用 [`supabase/migrations/20261112000000_initial.sql`](supabase/migrations/20261112000000_initial.sql)；[`supabase/schema.sql`](supabase/schema.sql) 保留为便于人工查看的同内容副本。
2. 在 Supabase Auth Users 中创建首位管理员（邮箱密码）。然后在 SQL Editor 执行以下授权语句，将邮箱替换为实际邮箱：

   ```sql
   insert into public.admin_accounts (id, email, role)
   select id, email, 'owner' from auth.users where email = 'your-email@example.com';
   ```

3. 独立 Netlify 站点已创建，站点名为 `rixingyishan-huixiang`；连接本项目的新 GitHub 仓库。发布目录为 `public`，Functions 目录为 `netlify/functions`，仓库内 `netlify.toml` 已声明这些配置。
4. 在 Netlify 站点环境变量中配置 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`。最后一项必须只放服务端环境变量，不能暴露给浏览器。参照 `.env.example`，不要提交真实密钥。
5. 在 Supabase Auth → Email Templates → Reset Password 中，将邮件正文改为 [`supabase/recovery-email.html`](supabase/recovery-email.html) 的内容，让邮件包含 `{{ .Token }}` 验证码。配置正式站点的 Auth Site URL，并启用可用的邮件发送服务；否则默认恢复邮件只提供链接，网站的验证码输入框无法使用。
6. 部署后在 Netlify Functions 页面核对 `cleanup` 显示为 Scheduled，下一次执行时间对应北京时间 00:00。定时函数只在已发布部署运行。

## 文件

- `public/`：静态页面、样式、交互脚本与首页海景图。
- `netlify/functions/api.mjs`：读取名单、批量填写、后台登录与管理接口；共用逻辑在 `netlify/shared.mjs`。
- `netlify/functions/cleanup.mjs`：每日定时调用数据库清理函数。
- `supabase/schema.sql`：独立 Supabase 项目的表、授权边界和原子清理函数。
- `lib.mjs`：分类、回向文和北京时间规则。

## 验证

运行 `node --test` 检查日期边界、重复填写、前台去重、后台导出和验证码接口。正式上线前还需连接新 Supabase 项目，逐项验证真实邮件、后台权限、定时任务以及手机端页面。
