import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const places = await prisma.place.findMany({
      where: {
        isActive: true,
      },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        address: true,
        operationMode: true,
      },
    });

    return NextResponse.json({
      ok: true,
      places,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        message: String(e?.message ?? e),
      },
      { status: 500 }
    );
  }
}