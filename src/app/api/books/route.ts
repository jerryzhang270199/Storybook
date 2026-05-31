import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const books = await prisma.book.findMany({
    include: { pages: { take: 1, orderBy: { pageNumber: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(books);
}
