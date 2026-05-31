"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

interface Book {
  id: string;
  title: string;
  style: string;
  createdAt: string;
  pages: { imageUrl: string }[];
}

export default function MyBooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/books")
      .then((res) => {
        if (!res.ok) throw new Error("绘本列表加载失败");
        return res.json();
      })
      .then((data) => {
        setBooks(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "绘本列表加载失败");
        setLoading(false);
      });
  }, []);

  const deleteBook = async (book: Book) => {
    if (!window.confirm(`确定删除《${book.title}》吗？删除后无法恢复。`)) return;

    setDeletingBookId(book.id);
    setError("");

    try {
      const response = await fetch(`/api/books/${book.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "删除绘本失败");
      }

      setBooks((currentBooks) => currentBooks.filter((item) => item.id !== book.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除绘本失败");
    } finally {
      setDeletingBookId(null);
    }
  };

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-amber-700">加载中...</div>
      </main>
    );
  }

  return (
    <main className="flex-1 px-4 py-8 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-amber-900">我的绘本</h1>
        <Link
          href="/create"
          className="px-6 py-2 bg-amber-600 text-white rounded-full font-medium hover:bg-amber-700 transition-colors"
        >
          创作新绘本
        </Link>
      </div>

      {error ? (
        <div className="text-center py-16">
          <p className="text-gray-500 text-lg">{error}</p>
        </div>
      ) : books.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 text-lg">还没有绘本，去创作一本吧</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {books.map((book) => (
            <div
              key={book.id}
              className="group"
            >
              <Link href={`/book/${book.id}`} className="block">
                <div className="aspect-square rounded-xl overflow-hidden shadow-md group-hover:shadow-lg transition-shadow bg-white">
                  {book.pages[0] && (
                    <Image
                      src={book.pages[0].imageUrl}
                      alt={book.title}
                      width={512}
                      height={512}
                      sizes="(max-width: 768px) 50vw, 256px"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <h3 className="mt-2 font-medium text-gray-800 group-hover:text-amber-700 transition-colors">
                  {book.title}
                </h3>
              </Link>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-xs text-gray-400">
                  {new Date(book.createdAt).toLocaleDateString("zh-CN")}
                </p>
                <button
                  type="button"
                  onClick={() => deleteBook(book)}
                  disabled={deletingBookId === book.id}
                  className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deletingBookId === book.id ? "删除中" : "删除"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
