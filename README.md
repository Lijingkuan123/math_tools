# 乘法小站

面向移动端的九九乘法表练习工具，提供 10/20 题计时测试、提交判分、错题集复习和历史成绩统计。

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

## 数据说明

- 测试记录、答题草稿和错题集保存在当前浏览器的 `localStorage`。
- 每位访问者的数据相互独立，不会上传到服务器。
- 答题过程中刷新页面可以继续，计时按照首次开始时间计算。
- 错题按乘法组合去重；错题复习答对后自动移出错题集。
