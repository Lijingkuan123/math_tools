# 乘法小站

面向移动端的九九乘法表练习工具，提供 10/20 题计时测试、提交判分、错题集复习、历史成绩，以及基于 Supabase 的练习组排行榜。

## 本地运行

项目不需要安装依赖。在当前目录启动任意静态文件服务器：

```bash
python3 -m http.server 18880 --bind 127.0.0.1
```

浏览器打开 `http://127.0.0.1:18880/`。

## 分享部署

项目全部由静态文件组成，可以直接部署到 GitHub Pages、Cloudflare Pages、Netlify、Nginx 或对象存储静态网站。页面中的“分享练习”会调用系统分享面板，不支持时自动复制当前链接。

链接可携带题量设置：

```text
https://Lijingkuan123.github.io/math_tools/?questions=10
https://Lijingkuan123.github.io/math_tools/?questions=20
```

在仓库的 `Settings > Pages` 中选择 `Deploy from a branch`，发布分支选择
`main` 和 `/ (root)`。发布完成后的首页为：

```text
https://Lijingkuan123.github.io/math_tools/
```

## 配置 Supabase 排行榜

未配置 Supabase 时，项目仍可正常完成本地测试、错题复习和历史记录；配置后可以创建或加入练习组，将新成绩同步到群组排行榜，并查看组员历史。

### 1. 创建项目和数据表

1. 登录 [Supabase](https://supabase.com/dashboard) 并创建项目。
2. 打开 `SQL Editor`，新建 Query。
3. 将 [`supabase/schema.sql`](./supabase/schema.sql) 的全部内容粘贴进去并执行。

脚本会创建：

- `practice_groups`：练习组和邀请码。
- `participants`：匿名用户在练习组中的昵称。
- `attempts`：每次测试或错题复习的成绩汇总。
- 创建/加入练习组的 RPC。
- 只允许同组成员读取、本人写入成绩的 RLS 策略。

### 2. 启用匿名登录

在 Supabase Dashboard 打开：

```text
Authentication → Providers → Anonymous Sign-Ins
```

启用匿名登录。项目不会要求用户填写邮箱或手机号，匿名会话保存在当前浏览器中。

### 3. 配置前端

在 Supabase 的 `Project Settings → API` 中复制：

- Project URL
- `anon` key 或 Publishable key

填写 [`supabase-config.js`](./supabase-config.js)：

```javascript
window.MATH_TOOLS_CONFIG = {
  supabaseUrl: "https://你的项目ID.supabase.co",
  supabaseAnonKey: "你的 anon 或 publishable key",
};
```

`anon`/Publishable key 可以用于浏览器，访问权限由 `schema.sql` 中的 RLS 控制。**不要把 `service_role`、Secret key 或数据库密码提交到 GitHub。**

### 4. 提交配置并发布

```bash
git add supabase-config.js
git commit -m "Configure Supabase leaderboard"
git push origin main
```

GitHub Pages 完成新一轮部署后，打开：

```text
https://Lijingkuan123.github.io/math_tools/#ranking
```

创建练习组后，分享链接会自动包含邀请码，例如：

```text
https://Lijingkuan123.github.io/math_tools/?questions=20&group=A1B2C3D4#home
```

对方第一次打开包含邀请码的链接时，输入昵称加入练习组。加入后完成的新测试会进入排行榜。

### 5. 验收

建议分别使用普通窗口和无痕窗口模拟两个用户：

1. 普通窗口创建练习组并复制分享链接。
2. 无痕窗口打开链接，使用另一个昵称加入。
3. 两个窗口分别完成一轮正式测试。
4. 在“排行”页刷新，确认两名用户的答题数和准确率。
5. 点击昵称，确认可以查看该用户的历史记录。

如果排行页提示匿名登录失败，检查 Supabase 是否已经启用 Anonymous Sign-Ins；如果创建或加入失败，重新执行 `supabase/schema.sql` 并检查浏览器控制台网络请求。

## 数据说明

- 测试记录、答题草稿和错题集保存在当前浏览器的 `localStorage`。
- 未加入练习组时，每位访问者的数据相互独立，不会上传到服务器。
- 加入练习组后，只向 Supabase 上传昵称和成绩汇总，不上传具体题目答案。
- 答题过程中刷新页面可以继续，计时按照首次开始时间计算。
- 错题按乘法组合去重；错题复习答对后自动移出错题集。
- 排行榜只统计正式测试；用户历史会同时展示正式测试和错题复习。
