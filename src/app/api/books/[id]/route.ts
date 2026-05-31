import { NextResponse } from "next/server";
import { collectBookImageUrlsForDeletion } from "@/lib/book-cleanup";
import { deleteCachedBookVideo } from "@/lib/book-video";
import { prisma } from "@/lib/db";
import { deleteSavedImages } from "@/lib/image-storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const book = await prisma.book.findUnique({
    where: { id },
    include: { pages: { orderBy: { pageNumber: "asc" } } },
  });

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  return NextResponse.json(book);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let imageUrls: string[] = [];

  const deletedBook = await prisma.$transaction(async (tx) => {
    const book = await tx.book.findUnique({
      where: { id },
      include: {
        generationJob: true,
        pages: true,
      },
    });

    if (!book) return null;

    imageUrls = collectBookImageUrlsForDeletion(book);

    await tx.page.deleteMany({ where: { bookId: book.id } });
    await tx.generationJob.deleteMany({ where: { bookId: book.id } });
    await tx.book.delete({ where: { id: book.id } });

    return { id: book.id };
  });

  if (!deletedBook) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  try {
    await Promise.all([
      deleteSavedImages(imageUrls),
      deleteCachedBookVideo(deletedBook.id),
    ]);
  } catch (error) {
    console.error("[book-delete] image cleanup failed", {
      bookId: deletedBook.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  return NextResponse.json({ ok: true });
}
