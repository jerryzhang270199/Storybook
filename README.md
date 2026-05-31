[中文](README.md) | [English](README.en.md)

<p align="center">
  <img src="./public/brand/logo-square.png" alt="Storybook AI logo" width="120" />
</p>

<h1 align="center">Storybook AI</h1>

Storybook AI 会把你珍视的人和舍不得遗忘的瞬间，写成一本专属 AI 绘本。孩子第一次学会走路、家人围坐共享的一餐、和爱人走过的街角，或一段只属于自己的成长与告别，那些不该被时间冲淡的记忆，都值得被温柔而认真地留下。

## 绘本预览

<div align="center">
  <video src="https://github.com/user-attachments/assets/7e12fdde-bf96-45e1-92a6-6e173137023b" controls width="760"></video>
  <sub><strong>给小外甥的儿童节礼物，一本关于我们的故事</strong></sub>
</div>

<br>
<br>

<div align="center">
  <video src="https://github.com/user-attachments/assets/f8cbb074-9714-49a0-901e-5c5a8a3a6364" controls width="360"></video>
  <sub><strong>我给过去那个少年，送了一份儿童节礼物</strong></sub>
</div>

## 产品能力

- 从文字想法和参考照片生成完整绘本
- 自动生成故事文本、页面插图和可选朗读音频
- 支持浏览器内翻页阅读和自动播放
- 支持保存为独立 HTML 绘本，配置朗读后可导出 MP4
- 本地优先：数据库和生成文件默认在自己机器上
- 可作为豆包 / 火山引擎方舟绘本应用模板二次开发

## 快速开始

准备：

- Node.js 24+
- npm 11+
- Docker Desktop，或你自己的 PostgreSQL
- 火山引擎方舟 API Key
- 用于故事生成的文本/聊天模型 ID，和用于图片生成的模型 ID

启动本地应用：

```bash
git clone https://github.com/jerryzhang270199/Storybook.git
cd Storybook

npm install
npm run init:local
```

打开 `.env`，至少填写：

```bash
DOUBAO_API_KEY=""
DOUBAO_STORY_MODEL=""
DOUBAO_IMAGE_MODEL=""
```

这些值需要在火山引擎控制台获取：

1. 注册并登录火山引擎账号，进入 [火山方舟 API Key 管理](https://www.volcengine.com/docs/82379/1361424) 页面，创建或复制 API Key，填入 `DOUBAO_API_KEY`。
2. 在火山方舟控制台开通可用的文本/聊天模型。把该模型的 Model ID，或你创建的自定义推理接入点 ID，填入 `DOUBAO_STORY_MODEL`。
3. 在火山方舟控制台开通可用的图片生成或图片编辑模型。把该模型的 Model ID，或自定义推理接入点 ID，填入 `DOUBAO_IMAGE_MODEL`。
4. 如果要启用朗读，再到 [豆包语音 API Key](https://www.volcengine.com/docs/6561/1816214) 页面创建或复制语音 API Key，填入 `DOUBAO_TTS_API_KEY`。这个 key 和方舟 `DOUBAO_API_KEY` 不是同一个，不要混用。

豆包 key、模型 ID 和 TTS 配置见 [豆包配置指南](docs/doubao-setup.zh-CN.md)。

填完后检查配置并启动：

```bash
npm run doctor
npm run doctor:doubao
npm run setup:local
npm run dev
```

打开 `http://localhost:3000/create` 开始生成绘本。

## 常用命令

```bash
npm run init:local # 创建 .env，并检查 Docker
npm run doctor      # 检查本地 .env 配置
npm run doctor:doubao # 用最小请求验证豆包 key 和故事模型
npm run db:up       # 启动本地 Postgres
npm run db:setup    # 生成 Prisma Client 并执行迁移
npm run db:studio   # 查看本地数据
npm run setup:local # 检查配置、启动 Postgres、执行迁移
npm run dev         # 启动本地应用
npm test            # 运行测试
npm run lint        # 运行 ESLint
npm run build       # 生产构建
```

## 许可证

本项目基于 MIT License 开源，详见 [LICENSE](./LICENSE)。
