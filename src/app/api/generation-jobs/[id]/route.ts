import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { GenerationJobStatus } from "@/lib/generation-job";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const job = await prisma.generationJob.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      error: true,
      bookId: true,
      createdAt: true,
      updatedAt: true,
      completedAt: true,
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Generation job not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...job,
    status: job.status as GenerationJobStatus,
  });
}
