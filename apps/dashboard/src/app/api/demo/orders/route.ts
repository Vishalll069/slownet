import { z } from "zod";

const orderSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid order" }, { status: 400 });
  }
  return Response.json({ order: { id: `ord-${crypto.randomUUID().slice(0, 8)}`, ...parsed.data, status: "confirmed" } }, { status: 201 });
}
