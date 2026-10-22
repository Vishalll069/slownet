export async function GET() {
  return Response.json({
    account: { id: "u-7", name: "Demo User", plan: "Pro", memberSince: "2024-03-01" },
  });
}
