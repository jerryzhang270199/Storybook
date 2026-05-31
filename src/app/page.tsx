import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl text-center space-y-8">
        <div className="space-y-5">
          <Image
            src="/brand/logo-square.png"
            alt="StoryBook AI"
            width={128}
            height={128}
            priority
            className="mx-auto h-28 w-28 rounded-[28px] shadow-sm"
          />
          <h1 className="text-5xl font-bold text-amber-900">StoryBook AI</h1>
        </div>
        <p className="text-2xl font-medium text-amber-800">
          把重要的人和不舍得遗忘的瞬间，做成一本专属的 AI 绘本
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/create"
            className="px-8 py-3 bg-amber-600 text-white rounded-full text-lg font-medium hover:bg-amber-700 transition-colors"
          >
            开始创作
          </Link>
          <Link
            href="/my-books"
            className="px-8 py-3 border-2 border-amber-600 text-amber-700 rounded-full text-lg font-medium hover:bg-amber-100 transition-colors"
          >
            我的绘本
          </Link>
        </div>

        <section
          aria-labelledby="about-storybook"
          className="mx-auto max-w-2xl space-y-4 rounded-xl bg-white px-5 py-6 text-left shadow-sm ring-1 ring-amber-100"
        >
          <h2 id="about-storybook" className="text-xl font-semibold text-amber-900">
            关于 StoryBook AI
          </h2>
          <p className="text-base leading-8 text-gray-700">
            有些人和瞬间，不该只被留在相册和聊天记录里。孩子第一次伸手、家人围坐的一顿饭、和爱人走过的街角、宠物靠近时安静的重量，或一段只属于自己的成长和告别，都值得被认真保存下来。
          </p>
          <p className="text-base leading-8 text-gray-700">
            StoryBook AI 会把这些重要的人和不舍得遗忘的瞬间，整理成一本专属的 AI 绘本。你只要写下故事，或上传几张参考照片，它会帮你梳理人物关系、情绪线索和画面细节，生成有起承转合的文字、统一风格的插图；配置豆包 TTS 后，还能配上朗读，让一段记忆变成可以翻阅、分享和珍藏的作品。
          </p>
          <a
            href="https://storybook-green-iota.vercel.app/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-full border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50"
          >
            先看一本会翻页的故事：https://storybook-green-iota.vercel.app/
          </a>
        </section>

        <div className="grid grid-cols-1 gap-6 text-center sm:grid-cols-3">
          <div className="p-4 bg-white rounded-xl shadow-sm">
            <div className="text-2xl mb-2">1. 上传照片</div>
            <p className="text-gray-600 text-sm">上传照片作为主角外貌参考</p>
          </div>
          <div className="p-4 bg-white rounded-xl shadow-sm">
            <div className="text-2xl mb-2">2. 描述故事</div>
            <p className="text-gray-600 text-sm">描述想要的故事</p>
          </div>
          <div className="p-4 bg-white rounded-xl shadow-sm">
            <div className="text-2xl mb-2">3. 生成绘本</div>
            <p className="text-gray-600 text-sm">AI 自动生成专属绘本</p>
          </div>
        </div>
      </div>
    </main>
  );
}
