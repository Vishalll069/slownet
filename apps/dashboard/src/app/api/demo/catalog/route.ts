const PRODUCTS = [
  { id: "p-101", name: "Field Notebook", priceCents: 1800 },
  { id: "p-102", name: "Brass Pen", priceCents: 4200 },
  { id: "p-103", name: "Canvas Tote", priceCents: 2600 },
  { id: "p-104", name: "Desk Lamp", priceCents: 8900 },
];

export async function GET() {
  return Response.json({ items: PRODUCTS });
}
